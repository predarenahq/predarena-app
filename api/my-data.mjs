import { createClient } from '@supabase/supabase-js'
import { sessionFromToken } from './session.mjs'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Every read that belongs to one person, behind a proven session.
 *
 * The point of this file is the line `sess.addresses`. It filters on addresses
 * the SERVER knows the caller proved by signature - never on an address the
 * client sends. A "server-side" endpoint that took { address } from the body
 * would be exactly as open as the anon key is today: anyone could ask for
 * anyone's bets. That version would have been theatre.
 *
 * With this, tickets and user_balances can finally go deny-all in RLS: the
 * service role reads them here, and nothing else can.
 */
export default async function handler(req, res) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  const sess = await sessionFromToken(token)
  if (!sess) return res.status(401).json({ error: 'session_invalid' })

  const type = req.query?.type

  try {
    if (type === 'balance') {
      // Balances are per WALLET (the custodial vault credits an address), not
      // per profile, so this returns each address's balance separately.
      const { data, error } = await supabase
        .from('user_balances')
        .select('wallet_address, balance_lamports')
        .in('wallet_address', sess.addresses)
      if (error) throw error
      return res.status(200).json({
        balances: data || [],
        total_lamports: (data || []).reduce((t, r) => t + Number(r.balance_lamports || 0), 0),
      })
    }

    if (type === 'tickets') {
      // Every address on the profile. This is why a session carries a profile
      // and not a bare address: a per-address session would show a fraction of
      // someone's bets - worse than leaving the table open.
      const { data, error } = await supabase
        .from('tickets')
        .select('*, battles(*)')
        .in('wallet_address', sess.addresses)
        .order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json({ tickets: data || [] })
    }

    if (type === 'me') {
      // avatar_url lives on the profile, not the session - fetch it so the
      // uploaded avatar survives refresh (rehydrate reads this).
      const { data: prof } = await supabase
        .from('profiles').select('avatar_url').eq('id', sess.profileId).single()
      return res.status(200).json({
        profile_id: sess.profileId,
        username:   sess.username,
        addresses:  sess.addresses,
        address:    sess.address,
        avatar_url: prof?.avatar_url ?? null,
      })
    }

    return res.status(400).json({ error: 'invalid_type' })
  } catch (err) {
    console.error('my-data error:', err.message)
    return res.status(500).json({ error: 'read_failed' })
  }
}
