export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  
  const category = req.query.category || 'BTC,ETH,SOL'
  
  try {
    const response = await fetch(
      `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${category}&sortOrder=latest`,
      { headers: { 'Accept': 'application/json' } }
    )
    const data = await response.json()
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
