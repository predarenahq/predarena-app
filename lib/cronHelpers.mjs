// Cron helpers — deposit sweep + solvency monitor. Kept out of cron.mjs so they
// can be unit-tested in isolation. cron.mjs imports and calls these.

import { Connection, PublicKey } from '@solana/web3.js'

// Custodial vault hot wallet - the single address deposits land in and
// withdrawals pay from. Same env var as lib/depositHandler.mjs, on purpose:
// these two reading different accounts is what silently deleted deposits.
const VAULT_ADDRESS = new PublicKey(
  process.env.PLATFORM_VAULT_ADDRESS || '5GD6YvnQeTLC1W1xYCD6jPzvg5vcn4wC5JZvKV4nsD3V'
)
const LAMPORTS = 1_000_000_000
const MAX_SINGLE_ODDS = 30.0
const MAX_COMBO_ODDS = 100.0
const MAX_PENDING_ATTEMPTS = 15 // ~15 min of retries before we stop and alert

// 24h momentum per coin, straight from price_history. The odds engine has
// always taken changeA/changeB; createBattles was passing 0,0, so the
// momentum half of the model never ran. price_history is the same series
// settlement reads, it needs no external API, and it cannot rate-limit us.
// A coin with too little history returns 0, which is an even prior.
export async function get24hMomentum(supabase, coins) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const out = {}
  await Promise.all([...new Set(coins)].map(async (coin) => {
    out[coin] = 0
    try {
      const [oldest, newest] = await Promise.all([
        supabase.from('price_history').select('price').eq('coin', coin)
          .gte('recorded_at', since).order('recorded_at', { ascending: true }).limit(1),
        supabase.from('price_history').select('price').eq('coin', coin)
          .order('recorded_at', { ascending: false }).limit(1),
      ])
      const o = Number(oldest.data?.[0]?.price)
      const n = Number(newest.data?.[0]?.price)
      if (o > 0 && n > 0) out[coin] = ((n - o) / o) * 100
    } catch (err) {
      console.error('momentum failed for ' + coin + ':', err.message)
    }
  }))
  return out
}

export async function getVaultLamports(rpcUrl) {
  const connection = new Connection(rpcUrl || 'https://api.devnet.solana.com', 'confirmed')
  return await connection.getBalance(VAULT_ADDRESS)
}

// Drains pending_deposits: deposits that hadn't reached finality when the user's
// browser gave up. Each is re-verified on-chain and credited exactly once
// (credit_deposit is keyed on signature, so a race with a client retry is safe).
export async function sweepPendingDeposits({ supabase, verifyDeposit }) {
  const { data: rows } = await supabase
    .from('pending_deposits').select('*')
    .order('created_at', { ascending: true }).limit(50)
  if (!rows?.length) return { swept: 0, credited: 0, failures: [] }

  let credited = 0
  const failures = []

  for (const row of rows) {
    // Already parked for review by the branch below. Don't re-verify it
    // every minute forever, and don't let it count as swept.
    if (String(row.last_error || '').startsWith('invalid:')) continue
    try {
      const v = await verifyDeposit(row.signature, row.wallet_address, { attempts: 2, delayMs: 1500 })

      if (v.status === 'ok') {
        const { error } = await supabase.rpc('credit_deposit', {
          p_wallet: row.wallet_address, p_lamports: v.lamports, p_signature: row.signature,
        })
        // already_processed = a client retry beat us. Either way it's credited.
        if (!error || String(error.message).includes('already_processed')) {
          await supabase.from('pending_deposits').delete().eq('signature', row.signature)
          credited++
        } else {
          failures.push({ signature: row.signature, reason: error.message })
          await supabase.from('pending_deposits')
            .update({ attempts: row.attempts + 1, last_error: error.message, checked_at: new Date().toISOString() })
            .eq('signature', row.signature)
        }
      } else if (v.status === 'invalid') {
        // A deposit we cannot credit is still money a user sent us. Park it
        // for a human instead of deleting it: DELETE here is exactly how the
        // wrong-vault bug made real deposits disappear with no record.
        console.error(`sweep: PARKED uncreditable deposit ${row.signature}: ${v.reason}`)
        await supabase.from('pending_deposits')
          .update({ last_error: 'invalid: ' + v.reason, checked_at: new Date().toISOString() })
          .eq('signature', row.signature)
      } else {
        // still pending finality
        const attempts = row.attempts + 1
        if (attempts >= MAX_PENDING_ATTEMPTS) {
          console.error(`⚠️ sweep: deposit ${row.signature} still unconfirmed after ${attempts} tries — manual review`)
        }
        await supabase.from('pending_deposits')
          .update({ attempts, checked_at: new Date().toISOString() })
          .eq('signature', row.signature)
      }
    } catch (err) {
      failures.push({ signature: row.signature, reason: err.message })
    }
  }
  return { swept: rows.length, credited, failures }
}

// Read-only solvency monitor. Does NOT gate anything (winners are always paid);
// it surfaces underwater state loudly so it can never hide the way the old
// Math.max(0,...) treasury did. Liability is the conservative sum of every open
// ticket's max payout.
export async function assertSolvency({ supabase, vaultLamports, solPrice }) {
  const { data: bal } = await supabase.from('user_balances').select('balance_lamports')
  const balancesLamports = (bal || []).reduce((s, r) => s + Number(r.balance_lamports), 0)

  const { data: tix } = await supabase
    .from('tickets').select('stake, odds, combo_id, combo_odds, claimed, battles(status)')
    .eq('claimed', false)

  let liabUsd = 0
  const seenCombos = new Set()
  for (const t of tix || []) {
    if (t.battles?.status === 'settled' || t.battles?.status === 'void') continue
    if (t.combo_id) {
      if (seenCombos.has(t.combo_id)) continue
      seenCombos.add(t.combo_id)
      liabUsd += Number(t.stake) * Math.min(Number(t.combo_odds), MAX_COMBO_ODDS)
    } else {
      liabUsd += Number(t.stake) * Math.min(Number(t.odds), MAX_SINGLE_ODDS)
    }
  }

  const liabLamports = Math.floor((liabUsd / solPrice) * LAMPORTS)
  const claims = balancesLamports + liabLamports
  const underwater = claims > vaultLamports

  if (underwater) {
    const gap = (claims - vaultLamports) / LAMPORTS
    console.error(`⚠️ SOLVENCY: claims ${(claims/LAMPORTS).toFixed(3)} SOL > vault ${(vaultLamports/LAMPORTS).toFixed(3)} SOL — short ${gap.toFixed(3)} SOL`)
  }
  return {
    balancesLamports, liabLamports, vaultLamports, underwater,
    vaultSol: vaultLamports / LAMPORTS, claimsSol: claims / LAMPORTS,
  }
}
