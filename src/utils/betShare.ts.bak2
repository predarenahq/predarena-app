import { supabase } from '../lib/supabase'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'PREDA-'
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export interface ShareLeg {
  battle_id: string
  side: number
}

// Creates a shareable booking code for a full slip (1+ legs). Legs are stored
// in the `legs` jsonb column so combos survive; the legacy single-leg columns
// are still populated from leg[0] so old codes/resolvers keep working.
export async function createBetShare(params: {
  legs: ShareLeg[]
  createdBy: string
  coinA?: string
  coinB?: string
  oddsAtShare?: number
  league?: string
  duration?: string
}): Promise<string> {
  if (!params.legs?.length) throw new Error('No legs to share')

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

  const first = params.legs[0]
  const { error } = await supabase.from('bet_shares').insert({
    code,
    legs: params.legs,
    battle_id: first.battle_id,
    side: first.side,
    odds_at_share: params.oddsAtShare ?? null,
    coin_a: params.coinA ?? '',
    coin_b: params.coinB ?? '',
    league: params.league ?? '',
    duration: params.duration ?? '',
    created_by: params.createdBy,
    uses: 0,
  })

  if (error) throw new Error('Failed to create share: ' + error.message)
  return code
}
