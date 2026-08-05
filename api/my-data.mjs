import { createClient } from '@supabase/supabase-js'
import { sessionFromToken } from './session.mjs'
import { PrivyClient } from '@privy-io/server-auth'

const privy = new PrivyClient(
  process.env.REACT_APP_PRIVY_APP_ID,
  process.env.PRIVY_APP_SECRET
)

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
// Resolve a Privy email token into the same { addresses, profileId } shape a
// wallet session has. Verified email -> profile (by email) -> its wallets.
// Returns null on any failure so the caller falls through to 401.
async function sessionFromEmailToken(token) {
  let email
  try {
    const claims = await privy.verifyAuthToken(token)
    const user = await privy.getUser(claims.userId)
    email = user?.email?.address?.toLowerCase() || null
  } catch { return null }
  if (!email) return null

  const { data: profile } = await supabase
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (!profile) return null

  const { data: wallets } = await supabase
    .from('profile_wallets').select('address').eq('profile_id', profile.id)
  const addresses = (wallets || []).map((w) => w.address)
  if (!addresses.length) return null

  return { addresses, profileId: profile.id }
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  // Two ways to resolve identity:
  //  (a) a wallet-session Bearer token (proven by signature) -> sessionFromToken
  //  (b) a Privy email token -> verified email -> profile -> its wallet addresses
  // Both produce the same shape: { addresses, profileId }. Email-primary logins
  // use (b), so a user sees their data without a wallet signature this session.
  let sess = await sessionFromToken(token)
  if (!sess && token) sess = await sessionFromEmailToken(token)
  if (!sess) return res.status(401).json({ error: 'session_invalid' })

  const type = req.query?.type

  try {
    if (type === 'balance') {
      // Balances are per WALLET (the custodial vault credits an address), not
      // per profile, so this returns each address's balance separately.
      const { data, error } = await supabase
        .from('user_balances')
        .select('wallet_address, balance_lamports, usdc_balance')
        .in('wallet_address', sess.addresses)
      if (error) throw error
      return res.status(200).json({
        balances: data || [],
        total_lamports: (data || []).reduce((t, r) => t + Number(r.balance_lamports || 0), 0),
        // Arc winnings, mirrored from the contract's internalBalance (6dp USDC).
        total_usdc: (data || []).reduce((t, r) => t + Number(r.usdc_balance || 0), 0),
      })
    }

    if (type === 'tickets') {
      // Scoped by PROFILE, not wallet. History belongs to the email's profile:
      // a bet is stamped with profile_id at placement, and read back here by
      // profile_id. So connecting a wallet that once belonged to another profile
      // never surfaces that profile's history - the query never touches wallet.
      // (Existing tickets were backfilled with profile_id from their wallet's
      // profile, so nothing is lost.) Balance stays wallet-scoped; money is
      // per-wallet, history is per-profile.
      const { data, error } = await supabase
        .from('tickets')
        .select('*, battles(*)')
        .eq('profile_id', sess.profileId)
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

    if (type === 'referrals') {
      const { data, error } = await supabase.rpc('referral_stats', { p_profile_id: sess.profileId })
      if (error) {
        console.error('referral_stats error:', error.message)
        return res.status(500).json({ error: 'referrals_failed' })
      }
      return res.status(200).json(data)
    }

    return res.status(400).json({ error: 'invalid_type' })
  } catch (err) {
    console.error('my-data error:', err.message)
    return res.status(500).json({ error: 'read_failed' })
  }
}
