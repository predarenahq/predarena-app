import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { supabase } from '../lib/supabase'

const COLORS = {
  bg: '#0a0f1a',
  panel: '#111827',
  accent: '#00f0ff',
  lineStrong: 'rgba(255,255,255,0.08)',
  textSoft: 'rgba(255,255,255,0.45)',
  coinA: '#00f0ff',
  coinB: '#a78bfa',
  entryLine: 'rgba(255,255,255,0.3)',
}

interface PriceChartModalProps {
  open: boolean
  onClose: () => void
  coinA: string
  coinB: string
  startTime: string
  startPriceA: number
  startPriceB: number
}

interface ChartPoint {
  time: string
  [key: string]: number | string
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function normalizePrice(price: number, startPrice: number): number {
  return ((price - startPrice) / startPrice) * 100
}

export default function PriceChartModal({
  open, onClose, coinA, coinB, startTime, startPriceA, startPriceB
}: PriceChartModalProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    fetchPriceHistory()
    const interval = setInterval(fetchPriceHistory, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coinA, coinB, startTime])

  async function fetchPriceHistory() {
    setLoading(true)
    try {
      const { data: histA } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('coin', coinA)
        .gte('recorded_at', startTime)
        .order('recorded_at', { ascending: true })
        .limit(200)

      const { data: histB } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('coin', coinB)
        .gte('recorded_at', startTime)
        .order('recorded_at', { ascending: true })
        .limit(200)

      if (!histA || !histB) return

      const timeMap: Record<string, ChartPoint> = {}

      for (const row of histA) {
        const t = row.recorded_at
        if (!timeMap[t]) timeMap[t] = { time: formatTime(t) }
        timeMap[t][coinA] = parseFloat(normalizePrice(row.price, startPriceA).toFixed(4))
      }

      for (const row of histB) {
        const t = row.recorded_at
        if (!timeMap[t]) timeMap[t] = { time: formatTime(t) }
        timeMap[t][coinB] = parseFloat(normalizePrice(row.price, startPriceB).toFixed(4))
      }

      const merged = Object.values(timeMap).sort((a, b) =>
        a.time > b.time ? 1 : -1
      )

      setData(merged)
    } catch (e) {
      console.error('Chart fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  const latestA = data.length ? (data[data.length - 1][coinA] as number) ?? 0 : 0
  const latestB = data.length ? (data[data.length - 1][coinB] as number) ?? 0 : 0
  const leadingCoin = latestA > latestB ? coinA : latestB > latestA ? coinB : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-2xl rounded-2xl p-6"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-white text-xl font-bold">{coinA} vs {coinB}</h2>
                <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>
                  Settlement price chart · Powered by Pyth Network
                </p>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl" style={{ background: COLORS.lineStrong }}>
                <X size={18} color="white" />
              </button>
            </div>

            <div className="flex gap-4 mb-6">
              <div className="flex-1 rounded-xl p-3 text-center" style={{ background: `${COLORS.coinA}15`, border: `1px solid ${COLORS.coinA}30` }}>
                <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>{coinA}</p>
                <p className="text-lg font-bold" style={{ color: COLORS.coinA }}>
                  {latestA >= 0 ? '+' : ''}{latestA.toFixed(4)}%
                </p>
              </div>
              <div className="flex items-center">
                <span className="text-white font-bold text-sm">VS</span>
              </div>
              <div className="flex-1 rounded-xl p-3 text-center" style={{ background: `${COLORS.coinB}15`, border: `1px solid ${COLORS.coinB}30` }}>
                <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>{coinB}</p>
                <p className="text-lg font-bold" style={{ color: COLORS.coinB }}>
                  {latestB >= 0 ? '+' : ''}{latestB.toFixed(4)}%
                </p>
              </div>
            </div>

            {leadingCoin && (
              <div className="mb-4 text-center">
                <span className="text-xs px-3 py-1 rounded-full font-semibold"
                  style={{ background: leadingCoin === coinA ? `${COLORS.coinA}20` : `${COLORS.coinB}20`, color: leadingCoin === coinA ? COLORS.coinA : COLORS.coinB }}>
                  {leadingCoin} is currently leading
                </span>
              </div>
            )}

            {loading && data.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <p style={{ color: COLORS.textSoft }}>Loading price data...</p>
              </div>
            ) : data.length < 2 ? (
              <div className="h-64 flex items-center justify-center flex-col gap-2">
                <p style={{ color: COLORS.textSoft }}>Waiting for more price data</p>
                <p className="text-xs" style={{ color: COLORS.textSoft }}>Chart updates every 5 minutes</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <XAxis dataKey="time" tick={{ fill: COLORS.textSoft, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: COLORS.textSoft, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
                    width={65}
                  />
                  <Tooltip
                    contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.lineStrong}`, borderRadius: 12 }}
                    labelStyle={{ color: COLORS.textSoft, fontSize: 11 }}
                    formatter={(value: any, name: any) => [`${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(4)}%`, String(name)]}
                  />
                  <ReferenceLine y={0} stroke={COLORS.entryLine} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey={coinA} stroke={COLORS.coinA} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey={coinB} stroke={COLORS.coinB} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Legend wrapperStyle={{ color: 'white', fontSize: 12 }} />
                </LineChart>
              </ResponsiveContainer>
            )}

            <p className="text-center text-xs mt-4" style={{ color: COLORS.textSoft }}>
              % change from battle start · Updates every 5 min · Settled via Pyth Network
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
