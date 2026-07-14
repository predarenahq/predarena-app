import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, Link as LinkIcon, ArrowUpRight } from 'lucide-react'

const COLORS = {
  bg: '#060d14',
  panel: '#0d1520',
  accent: '#00f0ff',
  lineStrong: 'rgba(255,255,255,0.08)',
  line: 'rgba(255,255,255,0.12)',
  textSoft: 'rgba(255,255,255,0.45)',
}

interface BetShareModalProps {
  open: boolean
  onClose: () => void
  code: string
  coinA: string
  coinB: string
  side: number
  odds: number
  stake: number
}

// Copy that works even inside in-app browsers (WhatsApp/Telegram) where
// navigator.clipboard is often blocked. Modern API first, textarea fallback.
async function robustCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Social share URL builders (patterns taken from the FlareTag share sheet).
const SOCIALS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    build: (url: string, msg: string) => `https://api.whatsapp.com/send?text=${encodeURIComponent(`${msg} ${url}`)}`,
    Icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    id: 'twitter',
    label: 'X',
    build: (url: string, msg: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(url)}`,
    Icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.264 5.633 5.9-5.633zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    build: (url: string, msg: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`,
    Icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
]

export default function BetShareModal({
  open, onClose, code, coinA, coinB, side, odds, stake,
}: BetShareModalProps) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [failed, setFailed] = useState(false)

  const pickLabel = side === 1 ? coinA : side === 2 ? coinB : 'Draw'
  const shareUrl = `${window.location.origin}/bet/${code}`
  const shareMsg = `I backed ${pickLabel} in ${coinA} vs ${coinB} at ${odds.toFixed(2)}x on PredArena. Tap my code ${code} to copy the bet:`

  async function doCopy(text: string, which: 'code' | 'link') {
    setFailed(false)
    const ok = await robustCopy(text)
    if (ok) {
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } else {
      setFailed(true)
      setTimeout(() => setFailed(false), 3500)
    }
  }

  function shareTo(build: (u: string, m: string) => string) {
    if (navigator.share) {
      navigator.share({ title: 'Join my bet on PredArena', text: shareMsg, url: shareUrl }).catch(() => {
        window.open(build(shareUrl, shareMsg), '_blank', 'noopener,noreferrer')
      })
      return
    }
    window.open(build(shareUrl, shareMsg), '_blank', 'noopener,noreferrer')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md rounded-[22px] overflow-hidden"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}`, boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 24px 60px rgba(0,240,255,0.10)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 p-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)' }}
              aria-label="Close"
            >
              <X size={15} color="rgba(255,255,255,0.7)" />
            </button>

            {/* HERO: 3-stop 135deg gradient, dark cyan */}
            <div
              className="relative flex flex-col items-center justify-center px-6 pt-11 pb-8 text-center"
              style={{ background: 'linear-gradient(135deg, #04181c 0%, #063d45 52%, #0a5f6b 100%)' }}
            >
              <span className="relative mb-5 flex items-center justify-center">
                <span className="absolute rounded-full" style={{ width: 52, height: 52, background: COLORS.accent, opacity: 0.18, transform: 'scale(1.5)', filter: 'blur(2px)' }} />
                <span className="flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: COLORS.accent }}>
                  <Check size={26} color="#04181c" strokeWidth={3} />
                </span>
              </span>

              <h1 className="mb-2 text-[28px] font-bold leading-tight text-white sm:text-[32px]">
                Ticket <em style={{ fontStyle: 'italic', fontFamily: 'Georgia, "Times New Roman", serif', color: COLORS.accent }}>placed.</em>
              </h1>

              <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{coinA} vs {coinB}</p>
              <p className="mt-1 text-[15px] font-semibold text-white">
                {pickLabel} <span style={{ color: COLORS.accent }}>· {odds.toFixed(2)}x</span> <span style={{ color: 'rgba(255,255,255,0.6)' }}>· ${stake}</span>
              </p>
            </div>

            {/* DARK SHARE CARD with cyan radial corner-bleed */}
            <div className="p-5 sm:p-6">
              <div
                className="relative overflow-hidden rounded-[16px] p-5"
                style={{ background: '#0a1119', border: `1px solid ${COLORS.lineStrong}` }}
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48"
                  style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.16) 0%, rgba(0,240,255,0) 60%)' }}
                />

                <div className="relative">
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.lineStrong}` }}>
                    <span className="relative flex h-[6px] w-[6px]">
                      <span className="absolute inline-flex h-full w-full rounded-full" style={{ background: COLORS.accent, opacity: 0.4, transform: 'scale(2.2)' }} />
                      <span className="relative inline-flex h-[6px] w-[6px] rounded-full" style={{ background: COLORS.accent }} />
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.5)' }}>Your booking code</span>
                  </div>

                  <p className="mb-1 break-all font-mono text-2xl font-bold tracking-widest" style={{ color: '#fff' }}>{code}</p>
                  <p className="mb-5 text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Anyone who enters this code gets the same bet pre-filled.
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => doCopy(code, 'code')}
                      className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors"
                      style={{ background: copied === 'code' ? 'rgba(0,240,255,0.15)' : COLORS.accent, color: copied === 'code' ? COLORS.accent : '#04181c' }}
                    >
                      {copied === 'code' ? <Check size={15} /> : <Copy size={15} />}
                      {copied === 'code' ? 'Copied!' : 'Copy code'}
                    </button>
                    <button
                      onClick={() => doCopy(shareUrl, 'link')}
                      className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors"
                      style={{ background: 'transparent', color: '#fff', border: `1px solid ${COLORS.line}` }}
                    >
                      {copied === 'link' ? <Check size={15} color={COLORS.accent} /> : <LinkIcon size={15} />}
                      {copied === 'link' ? 'Link copied' : 'Copy link'}
                    </button>
                  </div>
                </div>
              </div>

              {failed && (
                <p className="mt-3 text-center text-xs" style={{ color: '#f87171' }}>
                  Couldn't copy automatically — long-press the code to copy it manually.
                </p>
              )}

              <div className="mt-6">
                <h3 className="text-[15px] font-bold text-white">Spread the word</h3>
                <p className="mb-3.5 text-[12.5px]" style={{ color: COLORS.textSoft }}>
                  Drop your bet in the group chat. Every code copied grows the pool.
                </p>
                <div className="flex gap-2.5">
                  {SOCIALS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => shareTo(s.build)}
                      title={s.label}
                      aria-label={`Share on ${s.label}`}
                      className="flex h-12 flex-1 items-center justify-center rounded-[14px] transition-colors"
                      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.lineStrong}`, color: '#fff' }}
                    >
                      <s.Icon />
                    </button>
                  ))}
                  <button
                    onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                    title="Open bet"
                    aria-label="Open bet in a new tab"
                    className="flex h-12 flex-1 items-center justify-center rounded-[14px] transition-colors"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.lineStrong}`, color: '#fff' }}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
