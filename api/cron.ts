import { createClient } from '@supabase/supabase-js'
import { getPythPrices, BATTLE_PAIRS } from '../src/services/pythPrices'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL!,
  process.env.REACT_APP_SUPABASE_ANON_KEY!
)

const DURATION_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
}

export default async function handler(req: any, res: any) {
  try {
    await settleBattles()
    await createBattles()
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Cron error:', err)
    res.status(500).json({ error: String(err) })
  }
}

async function settleBattles() {
  const now = new Date().toISOString()

  // Get all live battles that have ended
  const { data: battles } = await supabase
    .from('battles')
    .select('*')
    .eq('status', 'live')
    .lte('end_time', now)

  if (!battles || battles.length === 0) return

  // Get all unique tickers needed
  const tickers = [...new Set(battles.flatMap(b => [b.coin_a, b.coin_b]))]
  const prices = await getPythPrices(tickers)

  for (const battle of battles) {
    const finalPriceA = prices[battle.coin_a]
    const finalPriceB = prices[battle.coin_b]

    if (!finalPriceA || !finalPriceB || !battle.start_price_a || !battle.start_price_b) {
      continue
    }

    // Calculate percentage change
    const changeA = (finalPriceA - battle.start_price_a) / battle.start_price_a
    const changeB = (finalPriceB - battle.start_price_b) / battle.start_price_b

    // Declare winner (0.1% threshold for draw)
    let winner = 0
    const threshold = 0.001
    if (Math.abs(changeA - changeB) <= threshold) {
      winner = 3 // draw
    } else if (changeA > changeB) {
      winner = 1 // coin A wins
    } else {
      winner = 2 // coin B wins
    }

    await supabase
      .from('battles')
      .update({
        status: 'settled',
        winner,
        final_price_a: finalPriceA,
        final_price_b: finalPriceB,
      })
      .eq('id', battle.id)

    console.log(`Settled battle ${battle.coin_a} vs ${battle.coin_b}: winner=${winner}`)
  }
}

async function createBattles() {
  const now = new Date()

  // Get all unique tickers needed
  const tickers = [...new Set(BATTLE_PAIRS.flatMap(p => [p.coinA, p.coinB]))]
  const prices = await getPythPrices(tickers)

  for (const pair of BATTLE_PAIRS) {
    // Check if there's already an active battle for this pair
    const { data: existing } = await supabase
      .from('battles')
      .select('id')
      .eq('coin_a', pair.coinA)
      .eq('coin_b', pair.coinB)
      .in('status', ['live', 'upcoming'])
      .limit(1)

    if (existing && existing.length > 0) continue

    const startPrice_a = prices[pair.coinA]
    const startPrice_b = prices[pair.coinB]

    if (!startPrice_a || !startPrice_b) continue

    const durationMs = DURATION_MS[pair.duration] || 3600000
    const startTime = new Date(now.getTime() + 2 * 60 * 1000) // starts in 2 mins
    const endTime = new Date(startTime.getTime() + durationMs)

    await supabase.from('battles').insert({
      coin_a: pair.coinA,
      coin_b: pair.coinB,
      league: pair.league,
      duration: pair.duration,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      start_price_a: startPrice_a,
      start_price_b: startPrice_b,
      status: 'upcoming',
      side_a_pool: 0,
      side_b_pool: 0,
      draw_pool: 0,
      total_pool: 0,
    })

    console.log(`Created battle: ${pair.coinA} vs ${pair.coinB}`)
  }
}
