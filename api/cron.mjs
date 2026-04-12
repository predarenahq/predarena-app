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
  
  // Fetch all in parallel
  await Promise.all(validTickers.map(async (ticker) => {
    const feedId = PYTH_FEEDS[ticker]
    try {
      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`
      const res = await fetch(url)
      if (!res.ok) {
        console.log(`Pyth error for ${ticker}: ${res.status}`)
        return
      }
      const data = await res.json()
      const parsed = data?.parsed?.[0]
      if (!parsed) return
      const price = Number(parsed.price.price) * Math.pow(10, parsed.price.expo)
      results[ticker] = price
    } catch (err) {
      console.error(`Pyth error for ${ticker}:`, err.message)
    }
  }))
  
  return results
}

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

    console.log(`Settled: ${battle.coin_a} vs ${battle.coin_b} winner=${winner}`)
  }
}

async function createBattles() {
  const now = new Date()
  const tickers = [...new Set(BATTLE_PAIRS.flatMap(p => [p.coinA, p.coinB]))]
  const prices = await getPythPrices(tickers)
  console.log('Prices fetched:', JSON.stringify(prices))

  for (const pair of BATTLE_PAIRS) {
    const { data: existing, error: fetchError } = await supabase
      .from('battles')
      .select('id')
      .eq('coin_a', pair.coinA)
      .eq('coin_b', pair.coinB)
      .in('status', ['live', 'upcoming'])
      .limit(1)

    console.log(`Check existing ${pair.coinA}/${pair.coinB}:`, existing, fetchError)
    if (existing && existing.length > 0) continue

    const startPriceA = prices[pair.coinA]
    const startPriceB = prices[pair.coinB]
    if (!startPriceA || !startPriceB) {
      console.log(`Missing prices for ${pair.coinA}/${pair.coinB}`)
      continue
    }

    const durationMs = DURATION_MS[pair.duration] || 3600000
    const startTime = new Date(now.getTime() + 2 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + durationMs)

    const { data, error } = await supabase.from('battles').insert({
      coin_a: pair.coinA,
      coin_b: pair.coinB,
      league: pair.league,
      duration: pair.duration,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      start_price_a: startPriceA,
      start_price_b: startPriceB,
      status: 'upcoming',
      side_a_pool: 0,
      side_b_pool: 0,
      draw_pool: 0,
      total_pool: 0,
    })

    console.log(`Insert ${pair.coinA}/${pair.coinB}:`, data, error)
  }
}

export default async function handler(req, res) {
  try {
    const tickers = ['BTC', 'ETH', 'SOL']
    const prices = await getPythPrices(tickers)
    
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
    
    await settleBattles()
    const result = await createBattles()
    
    res.status(200).json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      prices,
      supabaseUrl: supabaseUrl ? 'set' : 'missing',
      serviceKey: serviceKey ? 'set' : 'missing',
      anonKey: anonKey ? 'set' : 'missing',
    })
  } catch (err) {
    console.error('Cron error:', err)
    res.status(500).json({ error: String(err) })
  }
}
