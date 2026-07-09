// Pyth price feed IDs (mainnet - same IDs work for devnet endpoint)
export const PYTH_FEEDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  BNB: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  XRP: '0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feeff2d13323997f4a4349',
  DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  UNI: '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
  PEPE: '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
  JUP: '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  WIF: '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
  BONK: '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
}

// Battle pairs - every major pair that has a chart
export const BATTLE_PAIRS = [
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

const HERMES_BASE = 'https://hermes.pyth.network/v2/updates/price/latest'

// Single REST call to Hermes for a batch of tickers. Returns ticker -> USD price.
// Uses the same endpoint/parse as the bet flow — no SDK, no module-interop issues.
export async function getPythPrices(tickers: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {}

  // Map requested tickers -> feed ids, keeping a reverse lookup to decode the response
  const feedToTicker: Record<string, string> = {}
  const params: string[] = []
  for (const t of tickers) {
    const feed = PYTH_FEEDS[t]
    if (!feed) continue
    const bare = feed.replace(/^0x/, '').toLowerCase()
    feedToTicker[bare] = t
    params.push(`ids[]=${feed}`)
  }
  if (params.length === 0) return results

  try {
    const res = await fetch(`${HERMES_BASE}?${params.join('&')}`)
    if (!res.ok) return results
    const data = await res.json()
    const parsed = data?.parsed || []
    for (const item of parsed) {
      const id = String(item?.id || '').replace(/^0x/, '').toLowerCase()
      const ticker = feedToTicker[id]
      const p = item?.price
      if (ticker && p && typeof p.price !== 'undefined') {
        results[ticker] = Number(p.price) * Math.pow(10, p.expo)
      }
    }
  } catch {
    // Non-fatal: caller falls back to last known / start prices
  }

  return results
}

// Convenience single-ticker helper, same source.
export async function getPythPrice(ticker: string): Promise<number | null> {
  const prices = await getPythPrices([ticker])
  return prices[ticker] ?? null
}
