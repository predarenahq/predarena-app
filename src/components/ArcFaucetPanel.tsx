import React, { useState } from 'react'
import { Droplet, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react'

// Clipboard API is blocked in a lot of in-app browsers (WhatsApp, Telegram),
// which is where a testnet link usually gets opened. Same fallback as the share
// modal: never fail silently.
async function robustCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

const FAUCET_URL = 'https://faucet.circle.com'
const LOW_BALANCE = 2

/**
 * Arc runs on real testnet USDC from Circle's faucet - there is no mintable
 * play token. USDC is also the gas on Arc, so a user with an empty wallet can't
 * do anything at all, not even approve. This panel is the in-app path to the
 * faucet: it copies their address and sends them straight there.
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
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const isLow = Number(balance) < LOW_BALANCE

  const copyAddress = async () => {
    if (await robustCopy(address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Copy first: the faucet's own field is the next thing they'll touch.
  const openFaucet = async () => {
    await robustCopy(address)
    setCopied(true)
    window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')
    setTimeout(() => setCopied(false), 3000)
  }

  const refresh = async () => {
    if (!onRefresh) return
    setRefreshing(true)
    try { await onRefresh() } finally { setTimeout(() => setRefreshing(false), 600) }
  }

  if (!isLow) {
    return (
      <button
        onClick={openFaucet}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-80"
        style={{ color: '#a78bfa' }}
      >
        <Droplet className="h-3 w-3" />
        Get test USDC
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
            You need test USDC
          </p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Arc uses USDC for bets and for gas. Circle's faucet gives 20 USDC every 2 hours - no account needed.
          </p>

          <div className="mt-3 flex items-center gap-2 rounded-[10px] px-2.5 py-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
            <p className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {address}
            </p>
            <button
              onClick={copyAddress}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold"
              style={{
                background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                color: copied ? '#22c55e' : 'rgba(255,255,255,0.7)',
              }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <ol className="mt-3 space-y-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            <li>1. Open the faucet (your address is copied)</li>
            <li>2. Choose <span style={{ color: '#a78bfa' }}>Arc Testnet</span> as the network</li>
            <li>3. Paste your address and claim</li>
          </ol>

          <div className="mt-3 flex gap-2">
            <button
              onClick={openFaucet}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-xs font-semibold text-white transition-transform active:scale-[0.99]"
              style={{ background: 'rgba(124,58,237,0.85)' }}
            >
              Get test USDC
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            {onRefresh && (
              <button
                onClick={refresh}
                aria-label="Refresh balance"
                className="flex items-center justify-center rounded-[10px] px-3"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
              >
                <RefreshCw className={'h-3.5 w-3.5' + (refreshing ? ' animate-spin' : '')} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
