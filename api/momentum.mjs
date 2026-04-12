export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300')

  const { coins } = req.query
  if (!coins) return res.status(400).json({ error: 'coins required' })

  const COINGECKO_IDS = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
    AVAX: 'avalanche-2', BNB: 'binancecoin', DOGE: 'dogecoin',
    PEPE: 'pepe', LINK: 'chainlink', UNI: 'uniswap',
    JUP: 'jupiter-exchange-solana', WIF: 'dogwifcoin',
    BONK: 'bonk', XRP: 'ripple',
  }

  const tickers = coins.split(',')
  const geckoIds = tickers.map(t => COINGECKO_IDS[t]).filter(Boolean).join(',')

  try {
    const res2 = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { 'Accept': 'application/json' } }
    )
    const data = await res2.json()

    // Remap from gecko IDs back to tickers
    const result = {}
    for (const ticker of tickers) {
      const geckoId = COINGECKO_IDS[ticker]
      if (geckoId && data[geckoId]) {
        result[ticker] = {
          price: data[geckoId].usd,
          change24h: data[geckoId].usd_24h_change || 0,
        }
      }
    }
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
