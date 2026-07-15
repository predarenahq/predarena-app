import { createClient } from '@supabase/supabase-js'
import { Connection, PublicKey } from '@solana/web3.js'
import { priceLeg, MAX_SINGLE_ODDS } from '../lib/oddsEngine.mjs'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')
const [VAULT_PDA] = PublicKey.findProgramAddressSync([Buffer.from('platform_vault')], PROGRAM_ID)

const SOL_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'

// Minimal Pyth feed map — only what we need to price a bet. Kept local so this
// endpoint is self-contained. (Dedup opportunity: hoist PYTH_FEEDS +
// getPythPrices into api/lib/pyth.mjs shared with cron.mjs.)
const PYTH_FEEDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  BNB: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  XRP: '0xec5d399846a9209f3fe5881d70aae9268c7b040d3ce7b657b5af68ee9e46cd07',
  DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  UNI: '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
  PEPE: '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
  JUP: '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  WIF: '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
  BONK: '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
}

const QUOTE_TOLERANCE = 0.05 // 5% — how far the live price may drift from the
                             // user's tapped quote before we ask them to re-accept.

const ERROR_STATUS = {
  betting_locked:        403,
  battle_not_live:       403,
  battle_not_found:      404,
  insufficient_balance:  402,
  insufficient_liquidity: 402, // vault can't cover the worst-case book
  odds_changed:          409, // server price drifted past tolerance; client re-quotes
  odds_too_high:         400,
  invalid_stake:         400,
  invalid_side:          400,
  invalid_odds:          400,
  invalid_sol_price:     400,
  invalid_vault:         400,
  stake_too_small:       400,
  no_legs:               400,
}

async function getPythPrices(tickers) {
  const results = {}
  const valid = [...new Set(tickers)].filter((t) => PYTH_FEEDS[t])
  await Promise.all(valid.map(async (ticker) => {
    try {
      const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`)
      if (!res.ok) return
      const parsed = (await res.json())?.parsed?.[0]
      if (!parsed) return
      results[ticker] = Number(parsed.price.price) * Math.pow(10, parsed.price.expo)
    } catch (err) {
      console.error(`Pyth error for ${ticker}:`, err.message)
    }
  }))
  return results
}

async function getSolPrice() {
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_FEED}`)
  if (!res.ok) throw new Error('pyth_unavailable')
  const p = (await res.json())?.parsed?.[0]?.price
  if (!p || typeof p.price === 'undefined') throw new Error('pyth_unavailable')
  const price = Number(p.price) * Math.pow(10, p.expo)
  if (!(price > 0)) throw new Error('pyth_unavailable')
  return price
}

async function getVaultLamports() {
  const connection = new Connection(RPC_URL, 'confirmed')
  return await connection.getBalance(VAULT_PDA)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { wallet_address, stake, legs, chain, code } = req.body || {}
  if (!wallet_address) return res.status(400).json({ error: 'missing_wallet' })
  if (!Array.isArray(legs) || legs.length === 0) return res.status(400).json({ error: 'no_legs' })
  if (!(Number(stake) > 0)) return res.status(400).json({ error: 'invalid_stake' })

  for (const leg of legs) {
    if (!leg?.battle_id) return res.status(400).json({ error: 'missing_battle_id' })
    if (![1, 2, 3].includes(Number(leg.side))) return res.status(400).json({ error: 'invalid_side' })
    // leg.odds is now only the CLIENT'S QUOTE, checked against the server price
    // below. It is never trusted as the payout multiplier.
    if (!(Number(leg.odds) >= 1.01)) return res.status(400).json({ error: 'invalid_odds' })
  }

  try {
    // 1. Load the battles referenced by the legs.
    const battleIds = [...new Set(legs.map((l) => l.battle_id))]
    const { data: battles, error: bErr } = await supabase
      .from('battles')
      .select('*')
      .in('id', battleIds)
    if (bErr) throw bErr

    const byId = new Map((battles || []).map((b) => [b.id, b]))
    for (const id of battleIds) {
      if (!byId.has(id)) return res.status(404).json({ error: 'battle_not_found' })
    }

    // 2. Live prices for every coin in play.
    const coins = [...new Set((battles || []).flatMap((b) => [b.coin_a, b.coin_b]))]
    const prices = await getPythPrices(coins)
    for (const b of battles) {
      if (!(prices[b.coin_a] > 0) || !(prices[b.coin_b] > 0)) {
        // Can't price a bet without both live prices. Fail rather than guess.
        return res.status(503).json({ error: 'pricing_unavailable' })
      }
    }

    // 3. Price each leg SERVER-SIDE. The client quote is a courtesy; the server
    //    number is what gets stored and paid. If drift exceeds tolerance, the
    //    user re-accepts at the new price.
    const now = Date.now()
    const pricedLegs = []
    const drifted = []
    for (const leg of legs) {
      const battle = byId.get(leg.battle_id)
      const side = Number(leg.side)
      const serverOdds = priceLeg(battle, prices, now)[side]
      if (!(serverOdds >= 1.01)) return res.status(400).json({ error: 'invalid_odds' })
      if (serverOdds > MAX_SINGLE_ODDS) return res.status(400).json({ error: 'odds_too_high' })

      const clientQuote = Number(leg.odds)
      const drift = Math.abs(serverOdds - clientQuote) / serverOdds
      if (drift > QUOTE_TOLERANCE) {
        // Collect EVERY drifted leg instead of returning on the first one, so a
        // combo can be re-accepted in a single confirm tap rather than one per leg.
        drifted.push({
          battle_id: leg.battle_id,
          side,
          quoted: Number(clientQuote.toFixed(2)),
          current: Number(serverOdds.toFixed(2)),
        })
      }

      pricedLegs.push({ battle_id: leg.battle_id, side, odds: Number(serverOdds.toFixed(2)) })
    }

    // If ANY leg drifted past tolerance, ask the user to re-accept ALL of them
    // at once. `drifted` is the full list; the top-level battle_id/side/quoted/
    // current mirror drifted[0] for single-leg back-compat with older clients.
    if (drifted.length > 0) {
      return res.status(409).json({
        error: 'odds_changed',
        drifted,
        battle_id: drifted[0].battle_id,
        side: drifted[0].side,
        quoted: drifted[0].quoted,
        current: drifted[0].current,
      })
    }

    // 4. Vault balance + SOL price for the RPC's solvency gate and debit.
    const [solPrice, vaultLamports] = await Promise.all([getSolPrice(), getVaultLamports()])

    // 5. Atomic bet. Odds passed are the SERVER'S.
    const { data, error } = await supabase.rpc('place_bet', {
      p_wallet: wallet_address,
      p_stake: Number(stake),
      p_legs: pricedLegs,
      p_sol_price: solPrice,
      p_vault_lamports: vaultLamports,
      p_chain: chain || 'solana',
    })

    if (error) {
      const key = Object.keys(ERROR_STATUS).find((k) => String(error.message).includes(k))
      if (key) return res.status(ERROR_STATUS[key]).json({ error: key })
      console.error('place_bet error:', error.message)
      return res.status(500).json({ error: 'bet_failed' })
    }

    // Stamp the booking code onto the just-created ticket row(s). This runs
    // with the SERVICE ROLE (RLS-exempt), which is why it belongs here and not
    // on the client (client UPDATEs on tickets are blocked by RLS). Best-effort:
    // a stamp failure must never fail an already-placed bet.
    if (code) {
      try {
        await supabase.from('tickets')
          .update({ share_code: code })
          .eq('wallet_address', wallet_address)
          .is('share_code', null)
          .in('battle_id', legs.map((l) => l.battle_id))
          .gt('created_at', new Date(Date.now() - 30000).toISOString())
      } catch (stampErr) {
        console.error('share_code stamp failed:', stampErr?.message)
      }
    }

    return res.status(200).json(data)
  } catch (err) {
    if (err.message === 'pyth_unavailable') return res.status(503).json({ error: 'pricing_unavailable' })
    console.error('place-bet error:', err.message)
    return res.status(500).json({ error: 'bet_failed' })
  }
}
