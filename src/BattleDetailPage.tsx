import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { supabase } from './lib/supabase'
import { createBetShare } from './utils/betShare'
import { getStartingOdds, getInPlayOdds, OddsResult } from './services/oddsEngine'
import BetShareModal from './components/BetShareModal'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { useArcArena } from './arc/useArcArena'
import { ArcSide } from './arc/contracts'

const COLORS = {
  bg: 'var(--bg)',
  panel: 'var(--panel)',
  accent: 'var(--accent)',
  lineStrong: 'var(--border)',
  line: 'var(--border-soft)',
  textSoft: 'var(--text-soft)',
  coinA: 'var(--accent)',
  coinB: 'var(--accent-2)',
  green: 'var(--pos)',
  red: 'var(--neg)',
  arc: 'var(--accent)',
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
  const { wallets } = useWallets()
  const { connectWallet } = usePrivy()

  // ── Chain selector: 'solana' | 'arc' ────────────────────────────────────────
  const [chain, setChain] = useState<'solana' | 'arc'>('solana')

  const [battle, setBattle] = useState<any>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [countdown, setCountdown] = useState('')
  const [selectedSide, setSelectedSide] = useState<number | null>(null)
  const [stake, setStake] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }
  const [userBalance, setUserBalance] = useState(0)
  const [arcUSDCBalance, setArcUSDCBalance] = useState<string>('0.00')
  const [solPrice, setSolPrice] = useState(150)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareCode, setShareCode] = useState('')
  const [lastBet, setLastBet] = useState<{side: number, odds: number, stake: number} | null>(null)
  const [hasUserBet, setHasUserBet] = useState(false)
  const [engineOdds, setEngineOdds] = useState<OddsResult | null>(null)
  const [baseOdds, setBaseOdds] = useState<OddsResult | null>(null)
  const [searchParams] = useSearchParams()

  // ── Arc hook ─────────────────────────────────────────────────────────────────
  const {
    placeBet: arcPlaceBet,
    getArenaBalance,
    
    loading: arcLoading,
    
  } = useArcArena()

  // EVM wallet from Privy
  const evmWallet = wallets.find(w => w.chainId?.startsWith('eip155:'))
  const hasMetaMask = typeof window !== "undefined" && !!(window as any).ethereum
  const arcConnected = !!evmWallet || hasMetaMask

  useEffect(() => {
    if (!id) return
    const solAddr = connected && publicKey ? publicKey.toBase58() : ''
    const evmAddr = (evmWallet?.address) || (typeof window !== 'undefined' && (window as any).ethereum?.selectedAddress) || ''
    const addrs = [solAddr, evmAddr].filter(Boolean)
    if (!addrs.length) { setHasUserBet(false); return }
    ;(async () => {
      const { data } = await supabase.from('tickets').select('id').eq('battle_id', id).in('wallet_address', addrs).limit(1)
      setHasUserBet(!!(data && data.length))
    })()
  }, [id, connected, publicKey, evmWallet?.address])

  useEffect(() => {
    const sharedSide = searchParams.get('side')
    if (sharedSide) setSelectedSide(Number(sharedSide))
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

  // Fetch Arc USDC balance when Arc chain is selected
  useEffect(() => {
    if (chain === 'arc' && evmWallet?.address) {
      getArenaBalance(evmWallet.address as `0x${string}`)
        .then(setArcUSDCBalance)
        .catch(console.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, evmWallet?.address])

  async function fetchBattle() {
    const { data } = await supabase.from('battles').select('*').eq('id', id).single()
    setBattle(data)
    if (data && !baseOdds) {
      try {
        const base = await getStartingOdds(data.coin_a, data.coin_b)
        setBaseOdds(base)
        setEngineOdds(base)
      } catch(e) { console.error('Engine odds error:', e) }
    }
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

    if (bat && baseOdds) {
      try {
        const latestA = histA && histA.length > 0 ? histA[histA.length - 1].price : bat.start_price_a
        const latestB = histB && histB.length > 0 ? histB[histB.length - 1].price : bat.start_price_b
        const inPlay = getInPlayOdds(
          bat.coin_a, bat.coin_b,
          latestA, latestB,
          bat.start_price_a, bat.start_price_b,
          new Date(bat.start_time).getTime(),
          new Date(bat.end_time).getTime(),
          baseOdds,
          bat.side_a_pool || 0,
          bat.side_b_pool || 0,
          bat.draw_pool || 0
        )
        setEngineOdds(inPlay)
      } catch(e) { console.error('In-play odds error:', e) }
    }
  }

  async function fetchUserBalance() {
    const walletAddr = publicKey!.toBase58()
    const { data } = await supabase.from('user_balances').select('balance_lamports').eq('wallet_address', walletAddr).single()
    if (data) setUserBalance(data.balance_lamports)
    try {
      const res = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')
      const json = await res.json()
      const p = json?.parsed?.[0]
      if (p) setSolPrice(Number(p.price.price) * Math.pow(10, p.price.expo))
    } catch {}
  }

  // ── Solana bet handler (unchanged) ──────────────────────────────────────────
  async function handlePlaceBet() {
    if (bettingLocked) {
      showToast('Betting is closed for this battle', 'error')
      return
    }
    if (!connected || !publicKey || !selectedSide || !stake || !battle) return
    setLoading(true)
    try {
      const stakeUSD = parseFloat(stake)
      const walletAddr = publicKey.toBase58()

      const { data: balData } = await supabase.from('user_balances').select('balance_lamports').eq('wallet_address', walletAddr).single()
      const stakeLamports = Math.floor((stakeUSD / solPrice) * 1_000_000_000)
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

      const lockedOdds = selectedSide === 1 ? oddsA : selectedSide === 2 ? oddsB : oddsDraw
      const guaranteedPayout = stakeUSD * lockedOdds

      await supabase.from('tickets').insert({
        battle_id: battle.id,
        wallet_address: walletAddr,
        side: selectedSide,
        stake: stakeUSD,
        odds: lockedOdds,
        guaranteed_odds: Math.round(lockedOdds * 100) / 100,
        guaranteed_payout: Math.round(guaranteedPayout * 100) / 100,
        claimed: false,
      })

      await supabase.from('user_balances').update({
        balance_lamports: balData.balance_lamports - stakeLamports,
        updated_at: new Date().toISOString(),
      }).eq('wallet_address', walletAddr)

      const updateData: any = { total_pool: totalPool, updated_at: new Date().toISOString() }
      if (selectedSide === 1) updateData.side_a_pool = sidePool
      else if (selectedSide === 2) updateData.side_b_pool = sidePool
      else updateData.draw_pool = sidePool
      await supabase.from('battles').update(updateData).eq('id', battle.id)

      try {
        const code = await createBetShare({
          battleId: battle.id,
          side: selectedSide!,
          oddsAtShare: selectedOdds,
          coinA: battle.coin_a,
          coinB: battle.coin_b,
          league: battle.league,
          duration: battle.duration,
          createdBy: walletAddr,
        })
        setShareCode(code)
        setLastBet({ side: selectedSide!, odds: selectedOdds, stake: stakeUSD })
        setShareModalOpen(true)
      } catch(e) { console.error('Share failed:', e) }

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

  // ── Arc bet handler ──────────────────────────────────────────────────────────
  async function handlePlaceBetArc() {
    if (bettingLocked) {
      showToast('Betting is closed for this battle', 'error')
      return
    }
    if (!selectedSide || !stake || !battle) return
    try {
      // Map UI side (1/2/3) to Solidity enum (CoinA/CoinB/Draw)
      const sideMap: Record<number, ArcSide> = {
        1: ArcSide.CoinA,
        2: ArcSide.CoinB,
        3: ArcSide.Draw,
      }
      const arcSide = sideMap[selectedSide]

      // Convert odds to ODDS_DECIMALS (1.76 → 17600)
      const oddsScaled = BigInt(Math.round(selectedOdds * 10_000))

      const receipt = await arcPlaceBet(
        BigInt(battle.arc_battle_id || battle.id),
        arcSide,
        stake,           // USDC amount as string e.g. "10.00"
        oddsScaled,
      )

      // Store Arc bet in Supabase so it appears in history
      const arcAddress = evmWallet?.address || (window as any).ethereum?.selectedAddress || 'arc-wallet'
      await supabase.from('tickets').insert({
        battle_id: battle.id,
        wallet_address: arcAddress,
        side: selectedSide,
        stake: parseFloat(stake),
        odds: selectedOdds,
        guaranteed_odds: Math.round(selectedOdds * 100) / 100,
        guaranteed_payout: Math.round(parseFloat(stake) * selectedOdds * 100) / 100,
        chain: 'arc',
        arc_tx_hash: receipt.transactionHash,
        claimed: false,
      })

      setLastBet({ side: selectedSide!, odds: selectedOdds, stake: parseFloat(stake) })
      setStake('')
      setSelectedSide(null)

      // Refresh Arc balance
      if (evmWallet?.address) {
        const newBal = await getArenaBalance(evmWallet.address as `0x${string}`)
        setArcUSDCBalance(newBal)
      }

      showToast(`✅ Bet placed on Arc! Tx: ${receipt.transactionHash.slice(0, 10)}...`)
    } catch (e: any) {
      showToast('Arc bet failed: ' + (e.shortMessage || e.message), 'error')
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
  const oddsA = engineOdds?.oddsA ?? (totalPool === 0 || !battle.side_a_pool ? 2.0 : Math.round((totalPool / battle.side_a_pool) * 100) / 100)
  const oddsB = engineOdds?.oddsB ?? (totalPool === 0 || !battle.side_b_pool ? 2.0 : Math.round((totalPool / battle.side_b_pool) * 100) / 100)
  const oddsDraw = engineOdds?.oddsDraw ?? (totalPool === 0 || !battle.draw_pool ? 2.0 : Math.round((totalPool / battle.draw_pool) * 100) / 100)

  const now = Date.now()
  const battleEndTime = battle ? new Date(battle.end_time).getTime() : 0
  const isSettling = battleEndTime > 0 && now > battleEndTime && battle?.status === 'live'

  // Betting closes at 80% elapsed — matches BETTING_LOCK_THRESHOLD in useBattles
  const battleStartTime = battle ? new Date(battle.start_time).getTime() : 0
  const battleProgress = battleEndTime > battleStartTime
    ? Math.min(1, Math.max(0, (now - battleStartTime) / (battleEndTime - battleStartTime)))
    : 0
  const bettingLocked = battle?.status !== 'live' || battleProgress >= 0.80

  const isClosed = battle?.status === 'settled' || isSettling || bettingLocked

  const stakeUSD = parseFloat(stake) || 0
  const selectedOdds = selectedSide === 1 ? oddsA : selectedSide === 2 ? oddsB : oddsDraw
  const potentialWin = (stakeUSD * selectedOdds).toFixed(2)
  const balanceUSD = (userBalance / 1_000_000_000 * solPrice).toFixed(2)

  const isArc = chain === 'arc'
  

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      {lastBet && <BetShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        code={shareCode}
        coinA={battle?.coin_a || ''}
        coinB={battle?.coin_b || ''}
        side={lastBet.side}
        odds={lastBet.odds}
        stake={lastBet.stake}
      />}

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-[var(--panel)] sticky top-0 z-20" style={{ borderColor: "var(--border-soft)" }}>
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-[10px] text-sm font-medium transition-all hover:bg-[var(--border-soft)] active:scale-95" style={{ background: "var(--bg)", color: "var(--text-2)" }}>
          <ChevronLeft size={18} />
          Arena
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>{battle.coin_a} vs {battle.coin_b}</h1>
          <p className="text-xs font-medium" style={{ color: "var(--text-soft)" }}>{battle.league} · {battle.duration}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Time Left</p>
            <p className="font-mono font-semibold text-sm" style={{ color: countdown === "Ended" ? "var(--text-soft)" : "var(--text)" }}>{countdown}</p>
          </div>
          {countdown === "Ended" && hasUserBet && (
            <button onClick={() => navigate('/history')} className="h-9 px-4 rounded-[10px] text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95" style={{ background: "var(--brand-grad)" }}>
              View in History
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Live Score */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-[20px] p-5 text-center bg-[var(--panel)]" style={{ boxShadow: "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(124,58,237,0.06)" }}>
            <p className="text-[11px] mb-1.5 font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>{battle.coin_a}</p>
            <p className="text-[26px] font-semibold tracking-[-0.03em]" style={{ color: COLORS.coinA, fontVariantNumeric: "tabular-nums" }}>
              {latestA >= 0 ? '+' : ''}{latestA.toFixed(4)}%
            </p>
            <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-soft)" }}>since battle start</p>
          </div>
          <div className="rounded-[20px] p-5 text-center flex flex-col items-center justify-center bg-[var(--panel)]" style={{ boxShadow: "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(20,20,30,0.05)" }}>
            {leadingCoin ? (
              <>
                <p className="text-[11px] mb-1.5 font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>Leading</p>
                <p className="text-[19px] font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>{leadingCoin}</p>
                <p className="text-xs mt-1 font-semibold" style={{ color: leadingCoin === battle.coin_a ? COLORS.coinA : COLORS.coinB, fontVariantNumeric: "tabular-nums" }}>
                  +{Math.abs(latestA - latestB).toFixed(4)}%
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>TIED</p>
            )}
          </div>
          <div className="rounded-[20px] p-5 text-center bg-[var(--panel)]" style={{ boxShadow: "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(219,39,119,0.06)" }}>
            <p className="text-[11px] mb-1.5 font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>{battle.coin_b}</p>
            <p className="text-[26px] font-semibold tracking-[-0.03em]" style={{ color: COLORS.coinB, fontVariantNumeric: "tabular-nums" }}>
              {latestB >= 0 ? '+' : ''}{latestB.toFixed(4)}%
            </p>
            <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-soft)" }}>since battle start</p>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-2xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: "var(--text)" }}>Settlement Price Chart</h2>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
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
              <p className="font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Betting */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[17px]" style={{ color: "var(--text)" }}>Place Your Bet</h2>
            {/* Balance display */}
            {isArc && arcConnected && (
              <p className="text-xs" style={{ color: COLORS.textSoft }}>
                Arena balance: <span style={{ color: COLORS.accent }}>${arcUSDCBalance} USDC</span>
              </p>
            )}
            {!isArc && connected && (
              <p className="text-xs" style={{ color: COLORS.textSoft }}>Balance: ${balanceUSD}</p>
            )}
          </div>

          {/* Chain selector */}
          <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.lineStrong}` }}>
            <button
              onClick={() => setChain('solana')}
              className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
              style={{
                background: !isArc ? 'var(--accent-soft)' : 'transparent',
                color: !isArc ? COLORS.accent : COLORS.textSoft,
                border: !isArc ? '1px solid var(--accent)' : '1px solid transparent',
              }}
            >
              ◎ Solana
            </button>
            <button
              onClick={() => battle.arc_battle_id && setChain('arc')}
              className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
              style={{
                background: isArc ? 'rgba(124,58,237,0.2)' : 'transparent',
                color: isArc ? '#a78bfa' : COLORS.textSoft,
                border: isArc ? '1px solid rgba(124,58,237,0.4)' : '1px solid transparent',
              }}
            >
              ⬡ Arc · USDC
            </button>
          </div>

          {/* Arc info banner */}
          {isArc && (
            <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)' }}>
              <p style={{ color: '#a78bfa' }}>
                ⬡ Betting on Arc — payouts settle in USDC on-chain. Sub-second finality.
              </p>
            </div>
          )}

          {/* Side selection */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { side: 1, label: battle.coin_a, odds: oddsA, color: COLORS.coinA },
              { side: 3, label: 'Draw', odds: oddsDraw, color: 'rgba(255,255,255,0.6)' },
              { side: 2, label: battle.coin_b, odds: oddsB, color: COLORS.coinB },
            ].map(({ side, label, odds, color }) => (
              <button
                key={side}
                onClick={() => !isClosed && setSelectedSide(side)}
                className="rounded-xl p-3 text-center transition-all"
                style={{
                  background: selectedSide === side ? `${color}20` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedSide === side ? color : COLORS.line}`,
                }}
              >
                <p className="text-xs mb-1" style={{ color: selectedSide === side ? color : COLORS.textSoft }}>{label}</p>
                <p className="font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{odds.toFixed(2)}x</p>
              </button>
            ))}
          </div>

          {/* Stake input */}
          <div className="flex gap-3">
            <input
              type="number"
              placeholder={isArc ? 'Stake in USDC' : 'Stake in USD'}
              value={stake}
              onChange={e => setStake(e.target.value)}
              className="flex-1 rounded-[10px] px-4 py-3 outline-none text-sm"
              style={{ color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)" }}
            />
            {stakeUSD > 0 && selectedSide && (
              <div className="rounded-[10px] px-4 py-3 text-right" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)' }}>
                <p className="text-xs" style={{ color: COLORS.textSoft }}>Max Win</p>
                <p className="font-bold" style={{ color: COLORS.accent }}>${potentialWin}</p>
              </div>
            )}
          </div>

          {/* Action area */}
          {isClosed ? (
            <div className="flex flex-col items-center text-center py-5 rounded-[14px]" style={{ background: 'var(--panel-2)', border: '1px solid var(--border-soft)' }}>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>
                {battle?.status === 'settled' ? 'Battle settled' : 'Betting closed'}
              </p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--text-soft)' }}>
                {isSettling ? 'Waiting for oracle confirmation…' : hasUserBet ? 'Your result is ready to view' : 'This battle has ended'}
              </p>
              {battle?.status === 'settled' && hasUserBet && (
                <button onClick={() => navigate('/history')} className="mt-3 h-9 px-5 rounded-[10px] text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
                  View your result
                </button>
              )}
            </div>
          ) : isArc ? (
            !arcConnected ? (
              <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}>
                <button onClick={() => connectWallet()} style={{ background: 'rgba(124,58,237,0.8)', color: 'white', border: 'none', borderRadius: 12, padding: '12px 0', width: '100%', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Connect Wallet for Arc</button>
              </div>
            ) : (
              <button
                onClick={handlePlaceBetArc}
                disabled={arcLoading || !selectedSide || !stake}
                className="w-full rounded-xl py-3 font-semibold"
                style={{
                  background: arcLoading || !selectedSide || !stake ? 'rgba(255,255,255,0.1)' : 'rgba(124,58,237,0.8)',
                  color: arcLoading || !selectedSide || !stake ? COLORS.textSoft : 'white',
                }}
              >
                {arcLoading ? 'Confirming on Arc...' : '⬡ Place Bet on Arc'}
              </button>
            )
          ) : (
            !connected ? (
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
            )
          )}
        </div>
      </div>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? 'rgba(16,185,129,0.95)' : 'rgba(244,63,94,0.95)',
          color: 'white', padding: '12px 24px', borderRadius: 12, fontWeight: 600,
          fontSize: 14, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          maxWidth: '90vw', textAlign: 'center',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
