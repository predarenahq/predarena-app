export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300') // cache 5 mins

  try {
    const feeds = [
      'https://www.coindesk.com/arc/outboundfeeds/rss/',
      'https://cointelegraph.com/rss',
      'https://decrypt.co/feed',
    ]

    const results = await Promise.allSettled(
      feeds.map(url => fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml' }
      }).then(r => r.text()))
    )

    const articles = []

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const xml = result.value

      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
      for (const item of items.slice(0, 10)) {
        const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                      item.match(/<title>(.*?)<\/title>/)?.[1] || ''
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] ||
                     item.match(/<guid>(.*?)<\/guid>/)?.[1] || ''
        const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                     item.match(/<description>(.*?)<\/description>/)?.[1] || ''
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
        const source = link.includes('coindesk') ? 'CoinDesk' :
                       link.includes('cointelegraph') ? 'CoinTelegraph' : 'Decrypt'
        const image = item.match(/<media:content[^>]+url="([^"]+)"/)?.[1] ||
                      item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || ''

        if (title && link) {
          articles.push({
            id: link,
            title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
            body: desc.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').substring(0, 500),
            url: link,
            source,
            imageUrl: image,
            publishedAt: pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000),
            categories: '',
          })
        }
      }
    }

    // Sort by newest
    articles.sort((a, b) => b.publishedAt - a.publishedAt)

    res.status(200).json({ Data: articles })
  } catch (err) {
    console.error('News error:', err)
    res.status(500).json({ error: err.message })
  }
}
