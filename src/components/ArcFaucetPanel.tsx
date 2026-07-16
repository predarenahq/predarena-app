import React, { useState } from 'react'
import { Droplet, ExternalLink, Loader2, Check } from 'lucide-react'

const CIRCLE_FAUCET = 'https://faucet.circle.com'
const LOW_BALANCE = 2

const ERRORS: Record<string, string> = {
  already_claimed:   'You already claimed in the last 24 hours',
  daily_cap_reached: 'The faucet has hit its daily limit - try again tomorrow',
  faucet_empty:      'The faucet is out of funds right now',
  invalid_address:   'That wallet address is not valid',
  transfer_failed:   'The transfer failed - try again in a moment',
}

/**
 * Arc runs on real testnet USDC, and USDC is also the gas - so a user with an
 * empty wallet can do nothing at all, not even approve. This dispenses 2 USDC
 * from our faucet wallet with one tap.
 *
 * One NATIVE transfer covers both: on Arc the native balance and the USDC
 * ERC-20 interface are the same underlying balance, so a plain send lands as
 * gas AND as bettable USDC. Verified: 2.0 native / 2000000 ERC-20 from one tx.
 *
 * Circle's faucet stays as the fallback for when ours is dry or capped.
 */
export default function ArcFaucetPanel({
  address,
  balance,
  onRefresh,
}: {
  address: string
  balance: string
  onRefresh?: () => void
}) {
  const [claiming, setClaiming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const isLow = Number(balance) < LOW_BALANCE

  const claim = async () => {
    setClaiming(true)
    setError('')
    try {
      const res = await fetch('/api/arc-faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(ERRORS[data.error] || 'Could not send test USDC')
        return
      }
      setDone(true)
      // The tx is already confirmed server-side, but the balance read goes
      // through a different node - give it a beat to catch up.
      setTimeout(() => onRefresh?.(), 1500)
      setTimeout(() => setDone(false), 6000)
    } catch {
      setError('Could not reach the faucet')
    } finally {
      setClaiming(false)
    }
  }

  if (!isLow && !error) {
    return (
      <button
        onClick={claim}
        disabled={claiming}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ color: '#a78bfa' }}
      >
        {claiming
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : done ? <Check className="h-3 w-3" /> : <Droplet className="h-3 w-3" />}
        {claiming ? 'Sending…' : done ? 'Sent 2 USDC' : 'Get test USDC'}
      </button>
    )
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: 'rgba(124,58,237,0.2)' }}
        >
          <Droplet className="h-4 w-4" style={{ color: '#a78bfa' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
            {done ? '2 USDC sent' : 'You need test USDC'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {done
              ? 'It covers your stake and the gas. Your balance updates in a moment.'
              : 'Arc uses USDC for bets and for gas. Tap below and we will send you some.'}
          </p>

          {error && (
            <p className="mt-2 text-xs font-medium" style={{ color: '#f43f5e' }}>{error}</p>
          )}

          <button
            onClick={claim}
            disabled={claiming || done}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-xs font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
            style={{ background: 'rgba(124,58,237,0.85)' }}
          >
            {claiming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {done && <Check className="h-3.5 w-3.5" />}
            {claiming ? 'Sending…' : done ? 'Sent' : 'Send me 2 USDC'}
          </button>

          <button
            onClick={() => window.open(CIRCLE_FAUCET, '_blank', 'noopener,noreferrer')}
            className="mt-2 inline-flex items-center gap-1 text-[10px] transition-opacity hover:opacity-80"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Need more? Circle's faucet gives 20 every 2 hours
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
