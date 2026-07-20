import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'

// No supabase import. This page used to query the database directly from the
// browser with the anon key - so `const ADMIN_PASSWORD = 'preda2026admin'`
// (readable by anyone in the bundle) only ever gated RENDERING, never data.
// That is also how the waitlist's real names and emails were world-readable.
// Everything now comes from /api/admin-stats, which verifies the secret
// server-side and reads with the service role.
const SECRET_KEY = 'preda_admin_secret'

const C = {
  bg:       'var(--bg)',
  panel:    'var(--panel)',
  panel2:   'var(--panel-2)',
  accent:   'var(--accent)',
  line:     'var(--border)',
  line2:    'var(--border-soft)',
  soft:     'var(--text-soft)',
  softer:   'var(--text-muted)',
  green:    'var(--pos)',
  red:      'var(--neg)',
  gold:     'var(--warn)',
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
  const [referralEarnings, setReferralEarnings] = useState<any[]>([])
  const [ticketStats, setTicketStats] = useState<{ total: number; totalStaked: number; totalPaid: number }>({ total: 0, totalStaked: 0, totalPaid: 0 })
  const [pnl, setPnl] = useState<any[]>([])
  // null = unknown. The page hardcoded 85 and valued every user balance with it.
  const [solPrice, setSolPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'battles' | 'users' | 'waitlist' | 'referrals'>('overview')

  // Returns true when the secret was accepted. Five browser queries became one
  // authenticated call: the server verifies and reads with the service role, so
  // a wrong secret yields NO DATA rather than merely a hidden UI.
  const fetchAll = useCallback(async (secret?: string): Promise<boolean> => {
    const key = secret ?? sessionStorage.getItem(SECRET_KEY) ?? ''
    if (!key) return false
    setLoading(true)
    try {
      const res = await fetch('/api/admin-stats', { headers: { 'x-admin-secret': key } })
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_KEY)
        return false
      }
      if (!res.ok) throw new Error(`admin-stats ${res.status}`)
      const d = await res.json()

      setTreasury(d.treasury)
      setBattles(d.battles || [])
      setWaitlist(d.waitlist || [])
      setUserBalances(d.balances || [])
      setReferralEarnings(d.referralEarnings || [])
      setPnl(d.pnl || [])
      setSolPrice(d.solPrice ?? null)

      // Derived from admin_pnl, which groups by combo_id. The old code counted
      // ticket ROWS - so a 4-leg $10 combo showed as "4 bets, $40 staked".
      const rows = (d.pnl || []) as any[]
      setTicketStats({
        total: rows.reduce((a, r) => a + Number(r.bets || 0), 0),
        totalStaked: rows.reduce((a, r) => a + Number(r.wagered || 0), 0),
        totalPaid: 0,
      })
      return true
    } catch (e) {
      console.error('Admin fetch error:', e)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStorage.getItem(SECRET_KEY)) {
      fetchAll().then((ok) => setAuthed(ok))
    }
  }, [fetchAll])

  // Auth is now the SERVER's answer, not a string compare the client wins by
  // default. The old version checked pw === a constant that shipped in the JS.
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const ok = await fetchAll(pw)
    if (ok) {
      sessionStorage.setItem(SECRET_KEY, pw)
      setAuthed(true)
    } else {
      setPwError(true)
      setTimeout(() => setPwError(false), 2000)
    }
  }

  // triggerCron removed. It called /api/cron unauthenticated from the browser,
  // and that endpoint requires CRON_SECRET - a different secret, which cannot go
  // in a bundle. It has been silently 401ing since cron auth was added. The cron
  // runs every 5 minutes on its own schedule.

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
    { id: 'referrals', label: 'Referrals' },
  ] as const

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: C.line, background: C.panel }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sm" style={{ color: C.soft }}>← Arena</button>
          <div className="w-px h-4" style={{ background: C.line }} />
          <p className="text-white font-bold">Admin Panel</p>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: C.accent }}>
            PREDA
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAll()}
            className="text-sm px-4 py-2 rounded-xl font-medium"
            style={{ background: C.line, color: 'white' }}
          >
            Refresh
          </button>
        </div>
      </div>

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
            {/* Derived from tickets, not from platform_treasury. Those
                balance_usd columns froze on 9 July when apply_treasury_delta did
                not exist, and this page reported +$93.47 while the tickets said
                +$126.50 - the wrong SIGN of the business, next to a
                balance_lamports on the same row saying -$6.90. This cannot drift:
                it is computed from what happened. */}
            <Section title="House P&L">
              {(() => {
                const net = pnl.reduce((a, r) => a + Number(r.house_pnl || 0), 0)
                const wagered = pnl.reduce((a, r) => a + Number(r.wagered || 0), 0)
                const bets = pnl.reduce((a, r) => a + Number(r.bets || 0), 0)
                const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <StatCard label="Net P&L" value={money(net)} sub="settled bets, all chains" color={net >= 0 ? C.green : C.red} />
                      <StatCard label="Total Wagered" value={money(wagered)} sub={`${bets} settled bets`} color={C.gold} />
                      <StatCard label="Margin" value={wagered ? `${((net / wagered) * 100).toFixed(1)}%` : '—'} sub="net / wagered" color={C.accent} />
                      <StatCard
                        label="Treasury (ledger)"
                        value={treasury?.balance_lamports != null && solPrice != null
                          ? money((Number(treasury.balance_lamports) / 1e9) * solPrice)
                          : treasury?.balance_lamports != null
                            ? `${(Number(treasury.balance_lamports) / 1e9).toFixed(4)} SOL`
                            : '—'}
                        sub="lamports counter — drifts with SOL"
                        color={C.softer}
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      {pnl.map((r) => (
                        <StatCard
                          key={`${r.chain}-${r.kind}`}
                          label={`${r.chain} ${r.kind}`}
                          value={money(Number(r.house_pnl))}
                          sub={`${r.bets} bets · ${money(Number(r.wagered))} in`}
                          color={Number(r.house_pnl) >= 0 ? C.green : C.red}
                        />
                      ))}
                    </div>
                  </>
                )
              })()}
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
                  {/* The green "Active" dot that used to sit here read nothing -
                      it said Active whether the cron had run 30 seconds or three
                      weeks ago. arc-keeper silently mirrored nothing for hours
                      tonight while looking exactly this healthy. A real status
                      needs a last-run timestamp; until then, claim nothing. */}
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
                    const usdBalance = solPrice != null ? solBalance * solPrice : null
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
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: C.accent }}>{usdBalance != null ? `$${usdBalance.toFixed(2)}` : '—'}</td>
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
        {activeTab === 'referrals' && (
          <Section title="Referrer Earnings">
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.line}` }}>
                    <th className="text-left px-4 py-3" style={{ color: C.soft }}>Referrer</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>Friends Referred</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>USDC Earned</th>
                    <th className="text-right px-4 py-3" style={{ color: C.soft }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {referralEarnings.length === 0 && (
                    <tr><td colSpan={4} className="text-center px-4 py-8" style={{ color: C.soft }}>No referral earnings yet.</td></tr>
                  )}
                  {referralEarnings.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td className="text-left px-4 py-3 text-white">@{r.username || '-'}</td>
                      <td className="text-right px-4 py-3 text-white">{r.referred_count ?? 0}</td>
                      <td className="text-right px-4 py-3" style={{ color: C.accent }}>${Number(r.usd_earned || 0).toFixed(2)}</td>
                      <td className="text-right px-4 py-3 text-white">{r.points ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {activeTab === 'waitlist' && (
          <Section title="Waitlist Signups">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm" style={{ color: C.soft }}>{waitlist.length} total signups</p>
              <button
                onClick={exportWaitlistCSV}
                className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-medium"
                style={{ background: 'var(--accent-soft)', color: C.accent, border: `1px solid ${C.line2}` }}
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
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
