import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

const COLORS = {
  bg: 'var(--bg)',
  panel: 'var(--panel)',
  accent: 'var(--accent)',
  lineStrong: 'var(--border-soft)',
  textSoft: 'var(--text-soft)',
}

export default function BetSharePage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (code) resolveBetShare(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function resolveBetShare(shareCode: string) {
    const normalized = shareCode.toUpperCase()
    const { data, error } = await supabase
      .from('bet_shares')
      .select('code, uses')
      .eq('code', normalized)
      .single()

    if (error || !data) {
      setError('That booking code was not found or has expired.')
      return
    }

    supabase.from('bet_shares')
      .update({ uses: (data.uses || 0) + 1 })
      .eq('code', normalized)
      .then(() => {}, () => {})

    // Hand the code to the homepage, which rebuilds the whole slip from `legs`
    // (works for single bets AND combos), fetching current live odds.
    navigate(`/?betcode=${normalized}`, { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
      <div className="text-center p-8">
        {!error ? (
          <>
            <div className="mb-4 flex justify-center">
              <span className="h-10 w-10 rounded-full border-2 animate-spin" style={{ borderColor: COLORS.accent, borderTopColor: 'transparent' }} />
            </div>
            <p className="text-white text-lg font-semibold">Loading bet…</p>
            <p className="text-sm mt-2" style={{ color: COLORS.textSoft }}>Rebuilding the ticket from your code</p>
          </>
        ) : (
          <>
            <p className="text-white text-lg font-semibold mb-2">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-2 rounded-xl font-semibold"
              style={{ background: COLORS.accent, color: 'var(--accent-ink)' }}
            >
              Go to Arena
            </button>
          </>
        )}
      </div>
    </div>
  )
}
