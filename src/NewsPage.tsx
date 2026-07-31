import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const COLORS = {
  bg: 'var(--bg)',
  panel: 'var(--panel)',
  accent: 'var(--accent)',
  text: 'var(--text)',
  lineStrong: 'var(--border-soft)',
  line: 'var(--border)',
  textSoft: 'var(--text-soft)',
}

const CATEGORIES = ['All', 'BTC', 'ETH', 'SOL', 'DeFi', 'NFT', 'Regulation']

interface NewsItem {
  id: number
  title: string
  body: string
  url: string
  source: string
  imageUrl: string
  publishedAt: number
  categories: string
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NewsPage() {
  const navigate = useNavigate()
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCat, setSelectedCat] = useState('All')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, 5 * 60 * 1000) // refresh every 5 min
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCat])

  async function fetchNews() {
    setLoading(true)
    try {
      const cat = selectedCat === 'All' ? 'BTC,ETH,SOL,DeFi' : selectedCat
      const res = await fetch(`/api/content?type=news&category=${cat}`)
      const data = await res.json()
      if (data?.Data) {
        setNews(data.Data.map((item: any) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          url: item.url,
          source: item.source_info?.name || item.source,
          imageUrl: item.imageurl,
          publishedAt: item.published_on,
          categories: item.categories,
        })))
      }
    } catch (e) {
      console.error('News fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b sticky top-0 z-10" style={{ borderColor: COLORS.lineStrong, background: COLORS.bg }}>
        <button onClick={() => navigate('/')} className="p-2 rounded-xl" style={{ background: COLORS.panel }}>
          <ChevronLeft size={20} color={COLORS.text} />
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: COLORS.text }}>Crypto News</h1>
          <p className="text-xs" style={{ color: COLORS.textSoft }}>Live headlines · Powered by CryptoCompare</p>
        </div>
        <button onClick={fetchNews} disabled={loading} className="ml-auto text-xs px-3 py-2 rounded-xl font-medium" style={{ background: 'var(--accent-soft)', color: COLORS.accent, border: '1px solid var(--accent-soft)' }}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 px-4 py-4 overflow-x-auto border-b" style={{ borderColor: COLORS.lineStrong }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className="rounded-full px-4 py-2 text-sm font-medium shrink-0"
            style={{
              background: selectedCat === cat ? COLORS.accent : 'var(--border-soft)',
              color: selectedCat === cat ? 'var(--accent-ink)' : COLORS.text,
              border: `1px solid ${selectedCat === cat ? COLORS.accent : COLORS.line}`
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* News list */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: COLORS.panel, height: 120 }} />
          ))
        ) : news.map(item => (
          <div
            key={item.id}
            className="rounded-2xl overflow-hidden"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}
          >
            <div className="p-4">
              <div className="flex gap-4">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-20 h-20 rounded-xl object-cover shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: COLORS.accent }}>
                      {item.source}
                    </span>
                    <span className="text-xs" style={{ color: COLORS.textSoft }}>{timeAgo(item.publishedAt)}</span>
                  </div>
                  <h3
                    className="font-semibold text-sm leading-snug cursor-pointer hover:text-[var(--accent)] transition-colors"
                    style={{ color: COLORS.text }}
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  >
                    {item.title}
                  </h3>
                </div>
              </div>

              {/* Expanded summary */}
              <AnimatePresence initial={false}>
                {expanded === item.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.lineStrong }}>
                      <p className="text-sm leading-relaxed line-clamp-6" style={{ color: COLORS.textSoft }}>
                        {item.body?.replace(/<[^>]*>/g, '').substring(0, 400)}...
                      </p>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                        style={{ color: COLORS.accent }}
                      >
                        Read full article <ExternalLink size={12} />
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}

        {!loading && news.length === 0 && (
          <div className="text-center py-20">
            <p style={{ color: COLORS.textSoft }}>No news found for this category</p>
          </div>
        )}
      </div>
    </div>
  )
}
