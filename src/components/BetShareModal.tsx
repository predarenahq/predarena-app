import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, Share2 } from 'lucide-react'

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

export default function BetShareModal({
  open, onClose, code, coinA, coinB, side, odds, stake
}: BetShareModalProps) {
  const [copied, setCopied] = useState(false)

  const pickLabel = side === 1 ? coinA : side === 2 ? coinB : 'Draw'
  const shareUrl = `${window.location.origin}/bet/${code}`

  async function copyCode() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function shareNative() {
    if (navigator.share) {
      await navigator.share({
        title: 'Join my bet on PredArena',
        text: `I bet on ${pickLabel} in ${coinA} vs ${coinB} at ${odds}x odds. Use code ${code} to copy my bet!`,
        url: shareUrl,
      })
    } else {
      copyLink()
    }
  }

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
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Share2 size={18} style={{ color: COLORS.accent }} />
                <h2 className="text-white font-bold">Share Your Bet</h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl" style={{ background: COLORS.lineStrong }}>
                <X size={16} color="white" />
              </button>
            </div>

            {/* Bet summary */}
            <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(0,240,255,0.05)', border: `1px solid rgba(0,240,255,0.15)` }}>
              <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>{coinA} vs {coinB}</p>
              <p className="text-white font-semibold">
                {pickLabel} <span style={{ color: COLORS.accent }}>{odds.toFixed(2)}x</span>
              </p>
              <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>Stake: ${stake}</p>
            </div>

            {/* Share code */}
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: COLORS.textSoft }}>Share Code</p>
              <div className="flex gap-2">
                <div
                  className="flex-1 rounded-xl px-4 py-3 text-center font-mono text-xl font-bold tracking-widest"
                  style={{ background: COLORS.lineStrong, color: COLORS.accent, border: `1px solid rgba(0,240,255,0.2)` }}
                >
                  {code}
                </div>
                <button
                  onClick={copyCode}
                  className="px-4 rounded-xl flex items-center justify-center"
                  style={{ background: copied ? 'rgba(16,185,129,0.2)' : COLORS.lineStrong, border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : COLORS.line}` }}
                >
                  {copied ? <Check size={18} color="#10b981" /> : <Copy size={18} color="white" />}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                onClick={shareNative}
                className="w-full rounded-xl py-3 font-semibold text-black"
                style={{ background: COLORS.accent }}
              >
                📤 Share with Friends
              </button>
              <button
                onClick={copyLink}
                className="w-full rounded-xl py-3 font-medium text-sm"
                style={{ background: COLORS.lineStrong, color: 'white', border: `1px solid ${COLORS.line}` }}
              >
                🔗 Copy Link
              </button>
            </div>

            <p className="text-center text-xs mt-4" style={{ color: COLORS.textSoft }}>
              Friends who use your code get the same bet pre-filled
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
