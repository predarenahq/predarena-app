import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SOL_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'

// Errors raised by place_bet() → HTTP status. Anything unmapped is a 500.
const ERROR_STATUS = {
  betting_locked:       403,
  battle_not_live:      403,
  battle_not_found:     404,
  insufficient_balance: 402,
  invalid_stake:        400,
  invalid_side:         400,
  invalid_odds:         400,
  invalid_sol_price:    400,
  stake_too_small:      400,
  no_legs:              400,
}

async function getSolPrice() {
  // Server-side, no fallback default. A bad price must fail the bet, not
  // silently mis-debit the user (the old client used $100 when Pyth failed).
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_FEED}`)
  if (!res.ok) throw new Error('pyth_unavailable')
  const data = await res.json()
  const p = data?.parsed?.[0]?.price
  if (!p || typeof p.price === 'undefined') throw new Error('pyth_unavailable')
  const price = Number(p.price) * Math.pow(10, p.expo)
  if (!(price > 0)) throw new Error('pyth_unavailable')
  return price
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { wallet_address, stake, legs, chain } = req.body || {}

  if (!wallet_address) return res.status(400).json({ error: 'missing_wallet' })
  if (!Array.isArray(legs) || legs.length === 0) return res.status(400).json({ error: 'no_legs' })
  if (!(Number(stake) > 0)) return res.status(400).json({ error: 'invalid_stake' })

  // Shape-check each leg before it reaches Postgres.
  for (const leg of legs) {
    if (!leg?.battle_id) return res.status(400).json({ error: 'missing_battle_id' })
    if (![1, 2, 3].includes(Number(leg.side))) return res.status(400).json({ error: 'invalid_side' })
    if (!(Number(leg.odds) >= 1.01)) return res.status(400).json({ error: 'invalid_odds' })
  }

  try {
    const solPrice = await getSolPrice()

    const { data, error } = await supabase.rpc('place_bet', {
      p_wallet: wallet_address,
      p_stake: Number(stake),
      p_legs: legs.map((l) => ({
        battle_id: l.battle_id,
        side: Number(l.side),
        odds: Number(l.odds),
      })),
      p_sol_price: solPrice,
      p_chain: chain || 'solana',
    })

    if (error) {
      // Postgres RAISE messages arrive in error.message.
      const key = Object.keys(ERROR_STATUS).find((k) => String(error.message).includes(k))
      if (key) return res.status(ERROR_STATUS[key]).json({ error: key })
      console.error('place_bet rpc error:', error.message)
      return res.status(500).json({ error: 'bet_failed' })
    }

    return res.status(200).json(data)
  } catch (err) {
    if (err.message === 'pyth_unavailable') {
      return res.status(503).json({ error: 'price_unavailable' })
    }
    console.error('place-bet error:', err.message)
    return res.status(500).json({ error: 'bet_failed' })
  }
}
