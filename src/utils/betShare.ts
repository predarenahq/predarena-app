import { supabase } from '../lib/supabase'

export interface ShareLeg {
  battle_id: string
  side: number
}

// Pure code generator - no DB. Lets callers get a code BEFORE placing the bet
// (so it can be passed to the server for stamping) and persist the share row
// only after the bet succeeds.
export function makeShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'PREDA-'
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Persist a share row for an already-generated code. Called AFTER a successful
// bet, so we never orphan a bet_shares row for a bet that didn't place. Stores
// the full slip in `legs`; legacy single-leg columns are filled from leg[0].
export async function saveBetShare(params: {
  code: string
  legs: ShareLeg[]
  createdBy: string
  coinA?: string
  coinB?: string
  oddsAtShare?: number
  league?: string
  duration?: string
}): Promise<void> {
  if (!params.code) throw new Error('No code')
  if (!params.legs?.length) throw new Error('No legs to share')

  const first = params.legs[0]
  const { error } = await supabase.from('bet_shares').insert({
    code: params.code,
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
  if (error) throw new Error('Failed to save share: ' + error.message)
}

// Back-compat one-shot: generate + save in one call (used where a bet is already
// confirmed, e.g. the detail page). Returns the code.
export async function createBetShare(params: {
  legs: ShareLeg[]
  createdBy: string
  coinA?: string
  coinB?: string
  oddsAtShare?: number
  league?: string
  duration?: string
}): Promise<string> {
  const code = makeShareCode()
  await saveBetShare({ ...params, code })
  return code
}
