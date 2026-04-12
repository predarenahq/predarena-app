import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
)

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

const BATTLE_PAIRS = [
  { coinA: 'BTC', coinB: 'ETH', league: 'Major', duration: '1h' },
  { coinA: 'SOL', coinB: 'AVAX', league: 'L1', duration: '4h' },
  { coinA: 'BTC', coinB: 'SOL', league: 'Major', duration: '1h' },
  { coinA: 'ETH', coinB: 'BNB', league: 'Major', duration: '4h' },
  { coinA: 'XRP', coinB: 'BNB', league: 'Major', duration: '1D' },
  { coinA: 'DOGE', coinB: 'PEPE', league: 'Meme', duration: '30m' },
  { coinA: 'WIF', coinB: 'BONK', league: 'Meme', duration: '30m' },
  { coinA: 'LINK', coinB: 'UNI', league: 'DeFi', duration: '1h' },
  { coinA: 'SOL', coinB: 'JUP', league: 'L1', duration: '1h' },
  { coinA: 'ETH', coinB: 'SOL', league: 'L1', duration: '4h' },
]

const DURATION_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
}

async function getPythPrices(tickers) {
  const results = {}
  const validTickers = tickers.filter(t => PYTH_FEEDS[t])

  await Promise.all(validTickers.map(async (ticker) => {
    const feedId = PYTH_FEEDS[ticker]
    try {
      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      const parsed = data?.parsed?.[0]
      if (!parsed) return
      results[ticker] = Number(parsed.price.price) * Math.pow(10, parsed.price.expo)
    } catch (err) {
      console.error(`Pyth error for ${ticker}:`, err.message)
    }
  }))

  return results
}

const PLATFORM_FEE = 0.05 // 5% house cut
const TREASURY_WALLET = '4xjEzpBki9ekwx56oRSynsrbQ8uXaUa2wxmPhZXeHHNz'

async function settleBattles() {
  const now = new Date().toISOString()
  const { data: battles } = await supabase
    .from('battles')
    .select('*')
    .eq('status', 'live')
    .lte('end_time', now)

  if (!battles || battles.length === 0) return

  const tickers = [...new Set(battles.flatMap(b => [b.coin_a, b.coin_b]))]
  const prices = await getPythPrices(tickers)

  for (const battle of battles) {
    const finalPriceA = prices[battle.coin_a]
    const finalPriceB = prices[battle.coin_b]
    if (!finalPriceA || !finalPriceB || !battle.start_price_a || !battle.start_price_b) continue

    const changeA = (finalPriceA - battle.start_price_a) / battle.start_price_a
    const changeB = (finalPriceB - battle.start_price_b) / battle.start_price_b

    const threshold = 0.001
    let winner = 0
    if (Math.abs(changeA - changeB) <= threshold) winner = 3
    else if (changeA > changeB) winner = 1
    else winner = 2

    await supabase.from('battles').update({
      status: 'settled',
      winner,
      final_price_a: finalPriceA,
      final_price_b: finalPriceB,
    }).eq('id', battle.id)

    // Get ALL tickets for this battle
    const { data: allTickets } = await supabase
      .from('tickets')
      .select('*')
      .eq('battle_id', battle.id)

    if (!allTickets || allTickets.length === 0) {
      console.log(`No tickets for battle ${battle.id}`)
      continue
    }

    // Calculate total pot from ALL tickets (losers fund winners)
    const totalPotUSD = allTickets.reduce((sum, t) => sum + t.stake, 0)
    const winningTickets = allTickets.filter(t => t.side === winner)
    const losingTickets = allTickets.filter(t => t.side !== winner)

    // Total stake on winning side
    const winnerStakeTotal = winningTickets.reduce((sum, t) => sum + t.stake, 0)

    // Platform fee comes off the top of the total pot
    const platformFeeUSD = totalPotUSD * PLATFORM_FEE
    const payoutPoolUSD = totalPotUSD - platformFeeUSD

    console.log(`Battle ${battle.coin_a} vs ${battle.coin_b}: totalPot=$${totalPotUSD.toFixed(2)} fee=$${platformFeeUSD.toFixed(2)} payoutPool=$${payoutPoolUSD.toFixed(2)} winners=${winningTickets.length} losers=${losingTickets.length}`)

    // Get current SOL price for lamport conversion
    const solPrice = prices['SOL'] || 100

    // Credit platform fee to treasury in Supabase
    if (platformFeeUSD > 0) {
      const feeInLamports = Math.floor((platformFeeUSD / solPrice) * 1_000_000_000)
      const { data: treasuryBal } = await supabase
        .from('user_balances')
        .select('balance_lamports')
        .eq('wallet_address', TREASURY_WALLET)
        .single()

      if (treasuryBal) {
        await supabase.from('user_balances')
          .update({
            balance_lamports: treasuryBal.balance_lamports + feeInLamports,
            updated_at: new Date().toISOString()
          })
          .eq('wallet_address', TREASURY_WALLET)
      } else {
        await supabase.from('user_balances')
          .insert({
            wallet_address: TREASURY_WALLET,
            balance_lamports: feeInLamports,
            total_deposited: 0,
            total_withdrawn: 0,
            updated_at: new Date().toISOString()
          })
      }
      console.log(`Treasury credited $${platformFeeUSD.toFixed(2)} (${feeInLamports} lamports)`)
    }

    // Pay out winners proportionally from the payout pool
    // Each winner gets: (their stake / total winner stake) * payoutPool
    if (winningTickets.length > 0 && winnerStakeTotal > 0) {
      for (const ticket of winningTickets) {
        // Proportional share of payout pool
        const winnerShare = ticket.stake / winnerStakeTotal
        const payoutUSD = payoutPoolUSD * winnerShare
        const payoutLamports = Math.floor((payoutUSD / solPrice) * 1_000_000_000)

        // Actual multiplier achieved
        const actualOdds = payoutUSD / ticket.stake

        const { data: userBal } = await supabase
          .from('user_balances')
          .select('balance_lamports')
          .eq('wallet_address', ticket.wallet_address)
          .single()

        if (userBal) {
          await supabase.from('user_balances')
            .update({
              balance_lamports: userBal.balance_lamports + payoutLamports,
              updated_at: new Date().toISOString()
            })
            .eq('wallet_address', ticket.wallet_address)

          console.log(`Winner ${ticket.wallet_address}: stake=$${ticket.stake} payout=$${payoutUSD.toFixed(2)} (${actualOdds.toFixed(2)}x) = ${payoutLamports} lamports`)
        }
      }
    } else {
      // No winners — entire pot minus fee goes to treasury
      const noBettersFeeUSD = payoutPoolUSD
      const noBettersLamports = Math.floor((noBettersFeeUSD / solPrice) * 1_000_000_000)
      
      const { data: treasuryBal } = await supabase
        .from('user_balances')
        .select('balance_lamports')
        .eq('wallet_address', TREASURY_WALLET)
        .single()

      if (treasuryBal && noBettersLamports > 0) {
        await supabase.from('user_balances')
          .update({
            balance_lamports: treasuryBal.balance_lamports + noBettersLamports,
            updated_at: new Date().toISOString()
          })
          .eq('wallet_address', TREASURY_WALLET)
        console.log(`No winners — $${noBettersFeeUSD.toFixed(2)} added to treasury`)
      }
    }

    console.log(`Settled: ${battle.coin_a} vs ${battle.coin_b} winner=${winner}`)
  }
}

async function createBattles() {
  const now = new Date()
  const tickers = [...new Set(BATTLE_PAIRS.flatMap(p => [p.coinA, p.coinB]))]
  const prices = await getPythPrices(tickers)

  for (const pair of BATTLE_PAIRS) {
    const { data: existing } = await supabase
      .from('battles')
      .select('id')
      .eq('coin_a', pair.coinA)
      .eq('coin_b', pair.coinB)
      .in('status', ['live', 'upcoming'])
      .limit(1)

    if (existing && existing.length > 0) continue

    const startPriceA = prices[pair.coinA]
    const startPriceB = prices[pair.coinB]
    if (!startPriceA || !startPriceB) continue

    const durationMs = DURATION_MS[pair.duration] || 3600000
    const startTime = new Date(now.getTime() + 2 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + durationMs)

    const { error } = await supabase.from('battles').insert({
      coin_a: pair.coinA,
      coin_b: pair.coinB,
      league: pair.league,
      duration: pair.duration,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      start_price_a: startPriceA,
      start_price_b: startPriceB,
      status: 'live',
      side_a_pool: 0,
      side_b_pool: 0,
      draw_pool: 0,
      total_pool: 0,
    })

    if (error) console.error(`Insert error ${pair.coinA}/${pair.coinB}:`, error.message)
    else console.log(`Created: ${pair.coinA} vs ${pair.coinB}`)
  }

  return prices
}

export default async function handler(req, res) {
  try {
    await settleBattles()
    const prices = await createBattles()

    // Save price snapshots to history
    try {
      const priceRows = Object.entries(prices).map(([coin, price]) => ({
        coin,
        price,
        recorded_at: new Date().toISOString()
      }))
      if (priceRows.length > 0) {
        await supabase.from('price_history').insert(priceRows)
      }
    } catch (e) {
      console.error('Failed to save price history:', e)
    }

    res.status(200).json({ ok: true, timestamp: new Date().toISOString(), prices })
  } catch (err) {
    console.error('Cron error:', err)
    res.status(500).json({ error: String(err) })
  }
}
