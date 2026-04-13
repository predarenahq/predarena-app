import { supabase } from '../lib/supabase'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'PREDA-'
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function createBetShare(params: {
  battleId: string
  side: number
  oddsAtShare: number
  coinA: string
  coinB: string
  league: string
  duration: string
  createdBy: string
}): Promise<string> {
  let code = generateCode()
  let attempts = 0

  while (attempts < 5) {
    const { data } = await supabase
      .from('bet_shares')
      .select('code')
      .eq('code', code)
      .single()

    if (!data) break
    code = generateCode()
    attempts++
  }

  const { error } = await supabase.from('bet_shares').insert({
    code,
    battle_id: params.battleId,
    side: params.side,
    odds_at_share: params.oddsAtShare,
    coin_a: params.coinA,
    coin_b: params.coinB,
    league: params.league,
    duration: params.duration,
    created_by: params.createdBy,
    uses: 0,
  })

  if (error) throw new Error('Failed to create share: ' + error.message)
  return code
}
