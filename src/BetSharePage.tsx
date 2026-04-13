import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

const COLORS = {
  bg: '#060d14',
  panel: '#0d1520',
  accent: '#00f0ff',
  lineStrong: 'rgba(255,255,255,0.08)',
  textSoft: 'rgba(255,255,255,0.45)',
}

export default function BetSharePage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (code) resolveBetShare(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function resolveBetShare(shareCode: string) {
    const { data, error } = await supabase
      .from('bet_shares')
      .select('*')
      .eq('code', shareCode.toUpperCase())
      .single()

    if (error || !data) {
      setError('Bet share code not found or expired.')
      setLoading(false)
      return
    }

    // Increment uses
    await supabase.from('bet_shares')
      .update({ uses: (data.uses || 0) + 1 })
      .eq('code', shareCode.toUpperCase())

    // Navigate to battle detail page with pre-filled selection
    navigate(`/battle/${data.battle_id}?shareCode=${shareCode}&side=${data.side}&odds=${data.odds_at_share}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
      <div className="text-center p-8">
        {loading && !error ? (
          <>
            <div className="text-4xl mb-4">🎯</div>
            <p className="text-white text-lg font-semibold">Loading bet...</p>
            <p className="text-sm mt-2" style={{ color: COLORS.textSoft }}>Taking you to the battle</p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">❌</div>
            <p className="text-white text-lg font-semibold">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-2 rounded-xl font-medium text-black"
              style={{ background: COLORS.accent }}
            >
              Go to Arena
            </button>
          </>
        )}
      </div>
    </div>
  )
}

