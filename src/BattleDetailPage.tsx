import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { supabase } from './lib/supabase'
import { useWallet } from '@solana/wallet-adapter-react'

const COLORS = {
  bg: '#060d14',
  panel: '#0d1520',
  accent: '#00f0ff',
  lineStrong: 'rgba(255,255,255,0.08)',
  line: 'rgba(255,255,255,0.12)',
  textSoft: 'rgba(255,255,255,0.45)',
  coinA: '#00f0ff',
  coinB: '#a78bfa',
  green: '#10b981',
  red: '#f43f5e',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatCountdown(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return 'Ended'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function normalizePrice(price: number, startPrice: number): number {
  if (!startPrice) return 0
  return parseFloat((((price - startPrice) / startPrice) * 100).toFixed(4))
}

export default function BattleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { publicKey, connected } = useWallet()

  const [battle, setBattle] = useState<any>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [countdown, setCountdown] = useState('')
  const [selectedSide, setSelectedSide] = useState<number | null>(null)
  const [stake, setStake] = useState('')
  const [loading, setLoading] = useState(false)
  const [userBalance, setUserBalance] = useState(0)
  const [solPrice, setSolPrice] = useState(150)

  useEffect(() => {
    fetchBattle()
    fetchChart()
    const chartInterval = setInterval(fetchChart, 30000)
    const countdownInterval = setInterval(() => {
      setBattle((b: any) => b ? { ...b } : b)
    }, 1000)
    return () => {
      clearInterval(chartInterval)
      clearInterval(countdownInterval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (battle) setCountdown(formatCountdown(battle.end_time))
    const t = setInterval(() => {
      if (battle) setCountdown(formatCountdown(battle.end_time))
    }, 1000)
    return () => clearInterval(t)
  }, [battle])

  useEffect(() => {
    if (connected && publicKey) fetchUserBalance()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey])

  async function fetchBattle() {
    const { data } = await supabase.from('battles').select('*').eq('id', id).single()
    setBattle(data)
  }

  async function fetchChart() {
    if (!battle && !id) return
    const { data: bat } = await supabase.from('battles').select('*').eq('id', id).single()
    if (!bat) return
    setBattle(bat)

    const [{ data: histA }, { data: histB }] = await Promise.all([
      supabase.from('price_history').select('price, recorded_at').eq('coin', bat.coin_a).gte('recorded_at', bat.start_time).order('recorded_at', { ascending: true }).limit(300),
      supabase.from('price_history').select('price, recorded_at').eq('coin', bat.coin_b).gte('recorded_at', bat.start_time).order('recorded_at', { ascending: true }).limit(300),
    ])

    const timeMap: Record<string, any> = {}
    for (const row of (histA || [])) {
      const t = row.recorded_at
      if (!timeMap[t]) timeMap[t] = { time: formatTime(t), fullTime: t }
      timeMap[t][bat.coin_a] = normalizePrice(row.price, bat.start_price_a)
    }
    for (const row of (histB || [])) {
      const t = row.recorded_at
      if (!timeMap[t]) timeMap[t] = { time: formatTime(t), fullTime: t }
      timeMap[t][bat.coin_b] = normalizePrice(row.price, bat.start_price_b)
    }

    const merged = Object.values(timeMap).sort((a, b) => a.fullTime > b.fullTime ? 1 : -1)
    setChartData(merged)
  }

  async function fetchUserBalance() {
    const walletAddr = publicKey!.toBase58()
    const { data } = await supabase.from('user_balances').select('balance_lamports').eq('wallet_address', walletAddr).single()
    if (data) setUserBalance(data.balance_lamports)
    // Get SOL price
    try {
      const res = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')
      const json = await res.json()
      const p = json?.parsed?.[0]
      if (p) setSolPrice(Number(p.price.price) * Math.pow(10, p.price.expo))
    } catch {}
  }

  async function handlePlaceBet() {
    if (!connected || !publicKey || !selectedSide || !stake || !battle) return
    setLoading(true)
    try {
      const stakeUSD = parseFloat(stake)
        const walletAddr = publicKey.toBase58()

      const { data: balData } = await supabase.from('user_balances').select('balance_lamports').eq('wallet_address', walletAddr).single()
      if (!balData || balData.balance_lamports < stakeLamports) {
        alert('Insufficient balance')
        return
      }

      const totalPool = (battle.total_pool || 0) + stakeUSD
      const sidePool = selectedSide === 1
        ? (battle.side_a_pool || 0) + stakeUSD
        : selectedSide === 2
          ? (battle.side_b_pool || 0) + stakeUSD
          : (battle.draw_pool || 0) + stakeUSD

      const odds = totalPool === 0 || sidePool === 0 ? 2.0 : Math.round((totalPool / sidePool) * 100) / 100

      // Guaranteed odds floor
      const battleEnd = new Date(battle.end_time).getTime()
      const battleStart = new Date(battle.start_time).getTime()
      const timeProgress = Math.min(1, (Date.now() - battleStart) / (battleEnd - battleStart))
      const guaranteedOdds = Math.max(1.01, 1.50 - timeProgress * 0.49)
      const guaranteedPayout = stakeUSD * guaranteedOdds

      await supabase.from('tickets').insert({
        battle_id: battle.id,
        wallet_address: walletAddr,
        side: selectedSide,
        stake: stakeUSD,
        odds,
        guaranteed_odds: Math.round(guaranteedOdds * 100) / 100,
        guaranteed_payout: Math.round(guaranteedPayout * 100) / 100,
        claimed: false,
      })

      await supabase.from('user_balances').update({
        balance_lamports: balData.balance_lamports - stakeLamports,
        updated_at: new Date().toISOString(),
      }).eq('wallet_address', walletAddr)

      const updateData: any = {
        total_pool: totalPool,
        updated_at: new Date().toISOString(),
      }
      if (selectedSide === 1) updateData.side_a_pool = sidePool
      else if (selectedSide === 2) updateData.side_b_pool = sidePool
      else updateData.draw_pool = sidePool

      await supabase.from('battles').update(updateData).eq('id', battle.id)

      alert('Bet placed!')
      setStake('')
      setSelectedSide(null)
      fetchUserBalance()
      fetchBattle()
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!battle) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
      <p style={{ color: COLORS.textSoft }}>Loading battle...</p>
    </div>
  )

  const latestA = chartData.length ? (chartData[chartData.length - 1][battle.coin_a] ?? 0) : 0
  const latestB = chartData.length ? (chartData[chartData.length - 1][battle.coin_b] ?? 0) : 0
  const leadingCoin = latestA > latestB ? battle.coin_a : latestB > latestA ? battle.coin_b : null

  const totalPool = battle.total_pool || 0
  const oddsA = totalPool === 0 || !battle.side_a_pool ? 2.0 : Math.round((totalPool / battle.side_a_pool) * 100) / 100
  const oddsB = totalPool === 0 || !battle.side_b_pool ? 2.0 : Math.round((totalPool / battle.side_b_pool) * 100) / 100
  const oddsDraw = totalPool === 0 || !battle.draw_pool ? 2.0 : Math.round((totalPool / battle.draw_pool) * 100) / 100

  const stakeUSD = parseFloat(stake) || 0
  const stakeLamports = Math.floor((stakeUSD / solPrice) * 1_000_000_000)
  const selectedOdds = selectedSide === 1 ? oddsA : selectedSide === 2 ? oddsB : oddsDraw
  const potentialWin = (stakeUSD * selectedOdds).toFixed(2)
  const balanceUSD = (userBalance / 1_000_000_000 * solPrice).toFixed(2)

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: COLORS.lineStrong }}>
        <button onClick={() => navigate('/')} className="p-2 rounded-xl" style={{ background: COLORS.panel }}>
          <ChevronLeft size={20} color="white" />
        </button>
        <div>
          <h1 className="text-white text-xl font-bold">{battle.coin_a} vs {battle.coin_b}</h1>
          <p className="text-xs" style={{ color: COLORS.textSoft }}>{battle.league} · {battle.duration}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs" style={{ color: COLORS.textSoft }}>Time Left</p>
          <p className="text-white font-mono font-bold">{countdown}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Live Score */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl p-4 text-center" style={{ background: `${COLORS.coinA}10`, border: `1px solid ${COLORS.coinA}30` }}>
            <p className="text-xs mb-1 font-medium" style={{ color: COLORS.textSoft }}>{battle.coin_a}</p>
            <p className="text-2xl font-bold" style={{ color: COLORS.coinA }}>
              {latestA >= 0 ? '+' : ''}{latestA.toFixed(4)}%
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>since battle start</p>
          </div>
          <div className="rounded-2xl p-4 text-center flex flex-col items-center justify-center" style={{ background: COLORS.panel }}>
            {leadingCoin ? (
              <>
                <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>Leading</p>
                <p className="font-bold text-white">{leadingCoin}</p>
                <p className="text-xs mt-1" style={{ color: leadingCoin === battle.coin_a ? COLORS.coinA : COLORS.coinB }}>
                  +{Math.abs(latestA - latestB).toFixed(4)}%
                </p>
              </>
            ) : (
              <p className="text-sm font-bold text-white">TIED</p>
            )}
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ background: `${COLORS.coinB}10`, border: `1px solid ${COLORS.coinB}30` }}>
            <p className="text-xs mb-1 font-medium" style={{ color: COLORS.textSoft }}>{battle.coin_b}</p>
            <p className="text-2xl font-bold" style={{ color: COLORS.coinB }}>
              {latestB >= 0 ? '+' : ''}{latestB.toFixed(4)}%
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>since battle start</p>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-2xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Settlement Price Chart</h2>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(0,240,255,0.1)', color: COLORS.accent }}>
              Powered by Pyth Network
            </span>
          </div>

          {chartData.length < 2 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2">
              <p style={{ color: COLORS.textSoft }}>Building chart history...</p>
              <p className="text-xs" style={{ color: COLORS.textSoft }}>Price data captured every 5 minutes</p>
              <p className="text-xs" style={{ color: COLORS.textSoft }}>
                {chartData.length} / 2 data points collected
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <XAxis dataKey="time" tick={{ fill: COLORS.textSoft, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: COLORS.textSoft, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
                  width={70}
                />
                <Tooltip
                  contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.lineStrong}`, borderRadius: 12 }}
                  labelStyle={{ color: COLORS.textSoft, fontSize: 11 }}
                  formatter={(value: any, name: any) => [`${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(4)}%`, String(name)]}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" label={{ value: 'Battle Start', fill: COLORS.textSoft, fontSize: 10, position: 'insideTopLeft' }} />
                <Line type="monotone" dataKey={battle.coin_a} stroke={COLORS.coinA} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey={battle.coin_b} stroke={COLORS.coinB} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Legend wrapperStyle={{ color: 'white', fontSize: 12, paddingTop: 12 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="text-center text-xs mt-3" style={{ color: COLORS.textSoft }}>
            % change from battle start · Updates every 5 min · Settlement decided by Pyth oracle prices
          </p>
        </div>

        {/* Battle Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Pool', value: `$${(battle.total_pool || 0).toLocaleString()}` },
            { label: 'Entries', value: '-' },
            { label: 'Duration', value: battle.duration },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl p-4 text-center" style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}>
              <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>{label}</p>
              <p className="text-white font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Betting */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}>
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Place Your Bet</h2>
            {connected && <p className="text-xs" style={{ color: COLORS.textSoft }}>Balance: ${balanceUSD}</p>}
          </div>

          {/* Side selection */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { side: 1, label: battle.coin_a, odds: oddsA, color: COLORS.coinA },
              { side: 3, label: 'Draw', odds: oddsDraw, color: 'rgba(255,255,255,0.6)' },
              { side: 2, label: battle.coin_b, odds: oddsB, color: COLORS.coinB },
            ].map(({ side, label, odds, color }) => (
              <button
                key={side}
                onClick={() => setSelectedSide(side)}
                className="rounded-xl p-3 text-center transition-all"
                style={{
                  background: selectedSide === side ? `${color}20` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedSide === side ? color : COLORS.line}`,
                }}
              >
                <p className="text-xs mb-1" style={{ color: selectedSide === side ? color : COLORS.textSoft }}>{label}</p>
                <p className="font-bold text-white">{odds.toFixed(2)}x</p>
              </button>
            ))}
          </div>

          {/* Stake input */}
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Stake in USD"
              value={stake}
              onChange={e => setStake(e.target.value)}
              className="flex-1 rounded-xl px-4 py-3 text-white outline-none text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.line}` }}
            />
            {stakeUSD > 0 && selectedSide && (
              <div className="rounded-xl px-4 py-3 text-right" style={{ background: 'rgba(0,240,255,0.05)', border: `1px solid ${COLORS.accent}30` }}>
                <p className="text-xs" style={{ color: COLORS.textSoft }}>Max Win</p>
                <p className="font-bold" style={{ color: COLORS.accent }}>${potentialWin}</p>
                <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>
                  Min: ${(stakeUSD * Math.max(1.01, 1.50 - Math.min(1, (Date.now() - new Date(battle.start_time).getTime()) / (new Date(battle.end_time).getTime() - new Date(battle.start_time).getTime())) * 0.49)).toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {!connected ? (
            <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.line}` }}>
              <p style={{ color: COLORS.textSoft }}>Connect wallet to place a bet</p>
            </div>
          ) : (
            <button
              onClick={handlePlaceBet}
              disabled={loading || !selectedSide || !stake}
              className="w-full rounded-xl py-3 font-semibold text-black"
              style={{ background: loading || !selectedSide || !stake ? 'rgba(255,255,255,0.1)' : COLORS.accent, color: loading || !selectedSide || !stake ? COLORS.textSoft : 'black' }}
            >
              {loading ? 'Placing...' : 'Place Bet'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
