import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

const ADMIN_PASSWORD = 'preda2026admin'

const C = {
  bg:       '#060d14',
  panel:    '#0d1520',
  panel2:   '#111f2a',
  accent:   '#00f0ff',
  line:     'rgba(255,255,255,0.08)',
  line2:    'rgba(0,240,255,0.15)',
  soft:     'rgba(255,255,255,0.45)',
  softer:   'rgba(255,255,255,0.2)',
  green:    '#10b981',
  red:      '#f43f5e',
  gold:     '#f59e0b',
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <p className="text-xs mb-2 uppercase tracking-widest" style={{ color: C.soft }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: color || C.accent }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: C.softer }}>{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
        <span style={{ width: 3, height: 18, background: C.accent, borderRadius: 2, display: 'inline-block' }} />
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)

  // Data states
  const [treasury, setTreasury] = useState<any>(null)
  const [battles, setBattles] = useState<any[]>([])
  const [waitlist, setWaitlist] = useState<any[]>([])
  const [userBalances, setUserBalances] = useState<any[]>([])
  const [ticketStats, setTicketStats] = useState<{ total: number; totalStaked: number; totalPaid: number }>({ total: 0, totalStaked: 0, totalPaid: 0 })
  const [cronLoading, setCronLoading] = useState(false)
  const [cronResult, setCronResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'battles' | 'users' | 'waitlist'>('overview')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: treas },
        { data: batt },
        { data: wl },
        { data: balances },
        { data: tickets },
      ] = await Promise.all([
        supabase.from('platform_treasury').select('*').single(),
        supabase.from('battles').select('*, tickets(count)').order('created_at', { ascending: false }).limit(20),
        supabase.from('waitlist').select('*').order('signed_up_at', { ascending: false }),
        supabase.from('user_balances').select('*').order('balance_lamports', { ascending: false }).limit(50),
        supabase.from('tickets').select('stake, odds, claimed, side, created_at'),
      ])

      if (treas) setTreasury(treas)
      if (batt) setBattles(batt as any[])
      if (wl) setWaitlist(wl as any[])
      if (balances) setUserBalances(balances as any[])
      if (tickets) {
        const total = tickets.length
        const totalStaked = tickets.reduce((s: number, t: any) => s + (t.stake || 0), 0)
        const totalPaid = tickets.filter((t: any) => t.claimed).reduce((s: number, t: any) => s + (t.stake * t.odds || 0), 0)
        setTicketStats({ total, totalStaked, totalPaid })
      }
    } catch (e) {
      console.error('Admin fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem('preda_admin')
    if (saved === ADMIN_PASSWORD) {
      setAuthed(true)
      fetchAll()
    }
  }, [fetchAll])

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem('preda_admin', pw)
      setAuthed(true)
      fetchAll()
    } else {
      setPwError(true)
      setTimeout(() => setPwError(false), 2000)
    }
  }

  async function triggerCron() {
    setCronLoading(true)
    setCronResult(null)
    try {
      const res = await fetch('/api/cron')
      const data = await res.json()
      setCronResult(data.ok
        ? `✅ Success · ${data.pricesSaved || 0} prices saved · ${new Date(data.timestamp).toLocaleTimeString()}`
        : `❌ Error: ${data.errors?.join(', ') || 'Unknown'}`)
      fetchAll()
    } catch (e: any) {
      setCronResult(`❌ Failed: ${e.message}`)
    } finally {
      setCronLoading(false)
    }
  }

  function exportWaitlistCSV() {
    const header = 'Name,Email,Signed Up\n'
    const rows = waitlist.map(w =>
      `"${w.name}","${w.email}","${new Date(w.signed_up_at).toLocaleString()}"`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `predarena-waitlist-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const liveBattles = battles.filter(b => b.status === 'live')
  const solPrice = 85

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="w-full max-w-sm rounded-2xl p-8" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <div className="text-center mb-6">
            <p className="font-bold text-lg text-white mb-1">Admin Panel</p>
            <p className="text-sm" style={{ color: C.soft }}>PredArena · Restricted Access</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-white outline-none text-sm"
              style={{
                background: C.panel2,
                border: `1px solid ${pwError ? C.red : C.line}`,
                transition: 'border 0.2s'
              }}
            />
            {pwError && <p className="text-xs text-center" style={{ color: C.red }}>Incorrect password</p>}
            <button
              type="submit"
              className="w-full rounded-xl py-3 font-semibold text-black text-sm"
              style={{ background: C.accent }}
            >
              Enter
            </button>
          </form>
          <button onClick={() => navigate('/')} className="w-full mt-3 text-xs text-center" style={{ color: C.soft }}>
            ← Back to Arena
          </button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'battles', label: 'Battles' },
    { id: 'users', label: 'Users' },
    { id: 'waitlist', label: 'Waitlist' },
  ] as const

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: C.line, background: C.panel }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sm" style={{ color: C.soft }}>← Arena</button>
          <div className="w-px h-4" style={{ background: C.line }} />
          <p className="text-white font-bold">Admin Panel</p>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,240,255,0.1)', color: C.accent }}>
            PREDA
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerCron}
            disabled={cronLoading}
            className="text-sm px-4 py-2 rounded-xl font-medium"
            style={{ background: cronLoading ? C.line : 'rgba(0,240,255,0.1)', color: C.accent, border: `1px solid ${C.line2}` }}
          >
            {cronLoading ? 'Running...' : '▶ Run Cron'}
          </button>
          <button
            onClick={fetchAll}
            className="text-sm px-4 py-2 rounded-xl font-medium"
            style={{ background: C.line, color: 'white' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Cron result banner */}
      {cronResult && (
        <div className="px-6 py-2 text-sm text-center" style={{ background: cronResult.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: cronResult.startsWith('✅') ? C.green : C.red }}>
          {cronResult}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b px-6" style={{ borderColor: C.line }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === tab.id ? C.accent : 'transparent',
              color: activeTab === tab.id ? C.accent : C.soft,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading && <p className="text-center text-sm mb-6" style={{ color: C.soft }}>Loading...</p>}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            <Section title="Platform Financials">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  label="Treasury Balance"
                  value={`$${(treasury?.balance_usd || 0).toFixed(2)}`}
                  sub="Platform reserve"
                  color={C.accent}
                />
                <StatCard
                  label="Total Earned"
                  value={`$${(treasury?.total_earned_usd || 0).toFixed(2)}`}
                  sub="All-time fees"
                  color={C.green}
                />
                <StatCard
                  label="Total Paid Out"
                  value={`$${(treasury?.total_paid_out_usd || 0).toFixed(2)}`}
                  sub="Guaranteed payouts covered"
                  color={C.gold}
                />
                <StatCard
                  label="Net Earnings"
                  value={`$${((treasury?.total_earned_usd || 0) - (treasury?.total_paid_out_usd || 0)).toFixed(2)}`}
                  sub="Fees minus drawdowns"
                  color={C.green}
                />
              </div>
            </Section>

            <Section title="Betting Activity">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  label="Total Bets"
                  value={ticketStats.total.toLocaleString()}
                  sub="All time tickets"
                />
                <StatCard
                  label="Total Staked"
                  value={`$${ticketStats.totalStaked.toLocaleString()}`}
                  sub="Across all battles"
                  color={C.gold}
                />
                <StatCard
                  label="Live Battles"
                  value={liveBattles.length}
                  sub="Currently active"
                  color={C.green}
                />
                <StatCard
                  label="Waitlist Signups"
                  value={waitlist.length}
                  sub="Total registered"
                  color={C.accent}
                />
              </div>
            </Section>

            <Section title="Cron Status">
              <div className="rounded-2xl p-5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-white font-medium">Settlement Cron</p>
                    <p className="text-xs mt-1" style={{ color: C.soft }}>Runs every 5 minutes via cron-job.org</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: C.green }} />
                    <span className="text-sm" style={{ color: C.green }}>Active</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl p-3 text-center" style={{ background: C.panel2 }}>
                    <p className="text-xs mb-1" style={{ color: C.soft }}>Endpoint</p>
                    <p className="text-xs font-mono text-white">/api/cron</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: C.panel2 }}>
                    <p className="text-xs mb-1" style={{ color: C.soft }}>Schedule</p>
                    <p className="text-xs font-mono text-white">*/5 * * * *</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: C.panel2 }}>
                    <p className="text-xs mb-1" style={{ color: C.soft }}>Max Duration</p>
                    <p className="text-xs font-mono text-white">60s</p>
                  </div>
                </div>
                <button
                  onClick={triggerCron}
                  disabled={cronLoading}
                  className="mt-4 w-full rounded-xl py-3 font-semibold text-black text-sm"
                  style={{ background: cronLoading ? C.soft : C.accent }}
                >
                  {cronLoading ? 'Running Cron...' : '▶ Trigger Cron Manually'}
                </button>
                {cronResult && (
                  <p className="text-xs mt-3 text-center" style={{ color: cronResult.startsWith('✅') ? C.green : C.red }}>
                    {cronResult}
                  </p>
                )}
              </div>
            </Section>
          </>
        )}

        {/* BATTLES TAB */}
        {activeTab === 'battles' && (
          <Section title="All Battles">
            <div className="space-y-3">
              {battles.map(battle => {
                const isLive = battle.status === 'live'
                const isSettled = battle.status === 'settled'
                const endTime = new Date(battle.end_time)
                const isExpired = endTime < new Date() && isLive
                const entries = battle.tickets?.[0]?.count || 0

                return (
                  <div key={battle.id} className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${isExpired ? C.gold : C.line}` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            background: isLive ? 'rgba(16,185,129,0.1)' : isSettled ? 'rgba(255,255,255,0.05)' : 'rgba(244,63,94,0.1)',
                            color: isLive ? C.green : isSettled ? C.soft : C.red,
                          }}
                        >
                          {isExpired ? 'SETTLING' : battle.status.toUpperCase()}
                        </span>
                        <p className="text-white font-semibold">{battle.coin_a} vs {battle.coin_b}</p>
                        <span className="text-xs" style={{ color: C.soft }}>{battle.league} · {battle.duration}</span>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs" style={{ color: C.soft }}>Pool</p>
                          <p className="text-white text-sm font-semibold">${(battle.total_pool || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: C.soft }}>Entries</p>
                          <p className="text-white text-sm font-semibold">{entries}</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: C.soft }}>Ends</p>
                          <p className="text-sm font-semibold" style={{ color: isExpired ? C.gold : 'white' }}>
                            {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {isSettled && (
                          <div>
                            <p className="text-xs" style={{ color: C.soft }}>Winner</p>
                            <p className="text-sm font-semibold" style={{ color: C.accent }}>
                              {battle.winner === 1 ? battle.coin_a : battle.winner === 2 ? battle.coin_b : battle.winner === 3 ? 'Draw' : '—'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {isLive && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          { label: battle.coin_a, pool: battle.side_a_pool },
                          { label: 'Draw', pool: battle.draw_pool },
                          { label: battle.coin_b, pool: battle.side_b_pool },
                        ].map(({ label, pool }) => (
                          <div key={label} className="rounded-xl p-2 text-center" style={{ background: C.panel2 }}>
                            <p className="text-xs" style={{ color: C.soft }}>{label}</p>
                            <p className="text-sm font-semibold text-white">${(pool || 0).toLocaleString()}</p>
                            <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: C.line }}>
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${battle.total_pool ? ((pool || 0) / battle.total_pool * 100) : 33}%`,
                                  background: C.accent,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <Section title="User Balances">
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.line}` }}>
                    <th className="text-left px-4 py-3" style={{ color: C.soft }}>Wallet</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>Balance (SOL)</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>Balance (USD)</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>Total Deposited</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {userBalances.map((u, i) => {
                    const solBalance = u.balance_lamports / 1_000_000_000
                    const usdBalance = solBalance * solPrice
                    const depositedSol = (u.total_deposited || 0) / 1_000_000_000
                    const isTreasury = u.wallet_address === '4xjEzpBki9ekwx56oRSynsrbQ8uXaUa2wxmPhZXeHHNz'
                    return (
                      <tr
                        key={u.wallet_address}
                        style={{
                          background: i % 2 === 0 ? C.panel : C.panel2,
                          borderBottom: `1px solid ${C.line}`,
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isTreasury && (
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: C.gold }}>
                                Treasury
                              </span>
                            )}
                            <span className="font-mono text-xs text-white">
                              {u.wallet_address.slice(0, 8)}...{u.wallet_address.slice(-6)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-white">{solBalance.toFixed(4)}</td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: C.accent }}>${usdBalance.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right" style={{ color: C.soft }}>{depositedSol.toFixed(4)} SOL</td>
                        <td className="px-4 py-3 text-right text-xs" style={{ color: C.softer }}>
                          {u.updated_at ? new Date(u.updated_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* WAITLIST TAB */}
        {activeTab === 'waitlist' && (
          <Section title="Waitlist Signups">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm" style={{ color: C.soft }}>{waitlist.length} total signups</p>
              <button
                onClick={exportWaitlistCSV}
                className="text-sm px-4 py-2 rounded-xl font-medium"
                style={{ background: 'rgba(0,240,255,0.1)', color: C.accent, border: `1px solid ${C.line2}` }}
              >
                ↓ Export CSV
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.line}` }}>
                    <th className="text-left px-4 py-3" style={{ color: C.soft }}>#</th>
                    <th className="text-left px-4 py-3" style={{ color: C.soft }}>Name</th>
                    <th className="text-left px-4 py-3" style={{ color: C.soft }}>Email</th>
                    <th className="text-left px-4 py-3" style={{ color: C.soft }}>Twitter</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>Signed Up</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map((w, i) => (
                    <tr
                      key={w.id}
                      style={{
                        background: i % 2 === 0 ? C.panel : C.panel2,
                        borderBottom: `1px solid ${C.line}`,
                      }}
                    >
                      <td className="px-4 py-3" style={{ color: C.soft }}>{waitlist.length - i}</td>
                      <td className="px-4 py-3 text-white font-medium">{w.name}</td>
                      <td className="px-4 py-3" style={{ color: C.accent }}>{w.email}</td>
                      <td className="px-4 py-3" style={{ color: C.soft }}>
                        {w.twitter_handle ? `@${w.twitter_handle}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: C.softer }}>
                        {new Date(w.signed_up_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
