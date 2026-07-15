// Cron helpers — deposit sweep + solvency monitor. Kept out of cron.mjs so they
// can be unit-tested in isolation. cron.mjs imports and calls these.

import { Connection, PublicKey } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')
const [VAULT_PDA] = PublicKey.findProgramAddressSync([Buffer.from('platform_vault')], PROGRAM_ID)
const LAMPORTS = 1_000_000_000
const MAX_SINGLE_ODDS = 30.0
const MAX_COMBO_ODDS = 100.0
const MAX_PENDING_ATTEMPTS = 15 // ~15 min of retries before we stop and alert

export async function getVaultLamports(rpcUrl) {
  const connection = new Connection(rpcUrl || 'https://api.devnet.solana.com', 'confirmed')
  return await connection.getBalance(VAULT_PDA)
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
        // Will never succeed (failed tx, not a vault deposit, signer mismatch).
        console.error(`sweep: dropping invalid pending deposit ${row.signature}: ${v.reason}`)
        await supabase.from('pending_deposits').delete().eq('signature', row.signature)
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
