import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'crypto'
import nacl from 'tweetnacl'
import { PublicKey } from '@solana/web3.js'
import { verifyMessage, getAddress } from 'viem'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const NONCE_TTL_MS   = 5 * 60 * 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

// Stored hashed. A raw token in the DB means a read of auth_sessions hands over
// every live session; hashing costs one line and removes that.
const hash = (t) => createHash('sha256').update(t).digest('hex')

const signMessage = (nonce) =>
  `Sign in to PredArena\n\nThis proves you own this wallet. It costs nothing and sends no transaction.\n\nNonce: ${nonce}`

/**
 * Wallet session auth.
 *
 * Why this exists: RLS cannot protect tickets or user_balances today, because
 * there is no identity the DATABASE recognises. The app authenticates through
 * Privy and the Solana wallet adapter, so there is no auth.uid() for a policy to
 * key on - both tables sit at `qual: true`, readable by anyone holding the anon
 * key, which ships in the bundle.
 *
 * And a server endpoint keyed on a client-supplied address fixes NOTHING: anyone
 * can send any address and get the same data. The only thing that proves
 * ownership of an address is a SIGNATURE over a nonce the server issued.
 *
 * Same mechanism profiles (b) needs to prove address ownership. Built once.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { action } = req.body || {}
  if (action === 'nonce')  return issueNonce(req, res)
  if (action === 'verify') return verify(req, res)
  if (action === 'link')   return link(req, res)
  if (action === 'set_username') return setUsername(req, res)
  if (action === 'set_avatar')   return setAvatar(req, res)
  return res.status(400).json({ error: 'invalid_action' })
}

async function issueNonce(req, res) {
  const { address, chain } = req.body || {}
  if (chain !== 'solana' && chain !== 'evm') return res.status(400).json({ error: 'invalid_chain' })

  let addr
  try {
    addr = chain === 'evm'
      ? getAddress(String(address))            // checksummed, matching how tickets store it
      : new PublicKey(String(address)).toBase58()
  } catch {
    return res.status(400).json({ error: 'invalid_address' })
  }

  const nonce = randomBytes(24).toString('hex')
  const { error } = await supabase.from('auth_nonces').insert({ nonce, address: addr, chain })
  if (error) {
    console.error('nonce insert failed:', error.message)
    return res.status(500).json({ error: 'nonce_failed' })
  }
  return res.status(200).json({ nonce, message: signMessage(nonce) })
}

async function verify(req, res) {
  const { nonce, signature } = req.body || {}
  if (!nonce || !signature) return res.status(400).json({ error: 'missing_params' })

  // Claim the nonce ATOMICALLY. Filtering on used_at IS NULL inside the UPDATE
  // means two concurrent verifies cannot both succeed - the loser matches zero
  // rows. A nonce is one signature, one session.
  const { data: claimed } = await supabase
    .from('auth_nonces')
    .update({ used_at: new Date().toISOString() })
    .eq('nonce', nonce)
    .is('used_at', null)
    .gte('created_at', new Date(Date.now() - NONCE_TTL_MS).toISOString())
    .select()
    .single()

  if (!claimed) return res.status(401).json({ error: 'nonce_invalid_or_used' })

  const message = signMessage(nonce)
  let ok = false
  try {
    if (claimed.chain === 'solana') {
      ok = nacl.sign.detached.verify(
        new TextEncoder().encode(message),
        Buffer.from(signature, 'base64'),
        new PublicKey(claimed.address).toBytes()
      )
    } else {
      ok = await verifyMessage({
        address: claimed.address,
        message,
        signature,
      })
    }
  } catch (err) {
    console.error('verify error:', err.message)
    ok = false
  }
  if (!ok) return res.status(401).json({ error: 'bad_signature' })

  // A session is per ADDRESS, but a human is not. This wallet has three
  // (Solana adapter, Privy embedded, MetaMask) - so a session scoped to one of
  // them would make Running Bets show a FRACTION of the user's bets, which is
  // worse than leaving the tables open. The profile is what a session is really
  // for: it carries every address this person has proven.
  //
  // Called only here, after a signature verifies, so the address is proven.
  const { data: profile, error: pErr } = await supabase.rpc('get_or_create_profile', {
    p_address: claimed.address,
    p_chain: claimed.chain,
  })
  if (pErr) {
    console.error('profile failed:', pErr.message)
    return res.status(500).json({ error: 'profile_failed' })
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const { error } = await supabase.from('auth_sessions').insert({
    token: hash(token),
    address: claimed.address,
    chain: claimed.chain,
    expires_at: expiresAt.toISOString(),
  })
  if (error) {
    console.error('session insert failed:', error.message)
    return res.status(500).json({ error: 'session_failed' })
  }

  // The raw token is returned ONCE and never stored.
  return res.status(200).json({
    token,
    address: claimed.address,
    chain: claimed.chain,
    profile_id: profile.profile_id,
    username: profile.username,
    addresses: profile.addresses || [claimed.address],
    expires_at: expiresAt.toISOString(),
  })
}

/**
 * Links a NEW wallet to the caller's existing profile.
 *
 * TWO proofs, because either alone is exploitable:
 *   1. the caller's session token -> which profile to link INTO
 *   2. a fresh signature from the NEW wallet -> that the caller owns it
 * Without (2), anyone could claim someone else's address into their profile.
 */
async function setAvatar(req, res) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const sess = await sessionFromToken(token)
  if (!sess) return res.status(401).json({ error: 'session_invalid' })

  // Expect a data URL: "data:image/png;base64,...."
  const { image } = req.body || {}
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'missing_image' })

  const m = image.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/)
  if (!m) return res.status(400).json({ error: 'invalid_image_type' })
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
  const bytes = Buffer.from(m[2], 'base64')

  // 2MB cap. Base64 inflates ~33%, so the JSON body stays under Vercel's 4.5MB.
  if (bytes.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'image_too_large' })

  const path = `${sess.profileId}/avatar.${ext}`
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: `image/${m[1]}`, upsert: true })
  if (upErr) {
    console.error('avatar upload error:', upErr.message)
    return res.status(500).json({ error: 'upload_failed' })
  }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  // Cache-bust so the new image shows immediately (same path, upsert).
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error: rpcErr } = await supabase.rpc('set_avatar', { p_profile_id: sess.profileId, p_url: url })
  if (rpcErr) {
    console.error('set_avatar rpc error:', rpcErr.message)
    return res.status(500).json({ error: 'save_failed' })
  }
  return res.status(200).json({ ok: true, avatar_url: url })
}

async function setUsername(req, res) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const sess = await sessionFromToken(token)
  if (!sess) return res.status(401).json({ error: 'session_invalid' })

  const { username } = req.body || {}
  if (!username) return res.status(400).json({ error: 'missing_username' })

  const { data, error } = await supabase.rpc('set_username', {
    p_profile_id: sess.profileId,
    p_username: username,
  })
  if (error) {
    const m = String(error.message)
    if (m.includes('invalid_username')) return res.status(400).json({ error: 'invalid_username' })
    if (m.includes('username_taken'))   return res.status(409).json({ error: 'username_taken' })
    console.error('set_username error:', m)
    return res.status(500).json({ error: 'username_failed' })
  }
  return res.status(200).json(data)
}

async function link(req, res) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const sess = await sessionFromToken(token)
  if (!sess) return res.status(401).json({ error: 'session_invalid' })

  const { nonce, signature } = req.body || {}
  if (!nonce || !signature) return res.status(400).json({ error: 'missing_params' })

  const { data: claimed } = await supabase
    .from('auth_nonces')
    .update({ used_at: new Date().toISOString() })
    .eq('nonce', nonce)
    .is('used_at', null)
    .gte('created_at', new Date(Date.now() - NONCE_TTL_MS).toISOString())
    .select()
    .single()
  if (!claimed) return res.status(401).json({ error: 'nonce_invalid_or_used' })

  const message = signMessage(nonce)
  let ok = false
  try {
    if (claimed.chain === 'solana') {
      ok = nacl.sign.detached.verify(
        new TextEncoder().encode(message),
        Buffer.from(signature, 'base64'),
        new PublicKey(claimed.address).toBytes()
      )
    } else {
      ok = await verifyMessage({ address: claimed.address, message, signature })
    }
  } catch (err) {
    console.error('link verify error:', err.message)
    ok = false
  }
  if (!ok) return res.status(401).json({ error: 'bad_signature' })

  const { data, error } = await supabase.rpc('link_wallet', {
    p_profile_id: sess.profileId,
    p_address: claimed.address,
    p_chain: claimed.chain,
  })
  if (error) {
    if (String(error.message).includes('address_belongs_to_another_profile')) {
      return res.status(409).json({ error: 'address_belongs_to_another_profile' })
    }
    console.error('link_wallet error:', error.message)
    return res.status(500).json({ error: 'link_failed' })
  }
  return res.status(200).json(data)
}

/**
 * Shared by every authenticated read. Returns the session's profile and EVERY
 * address it owns - not just the one that signed - or null.
 *
 * Reads must filter on `addresses`, never on an address the client sends: a
 * client-supplied address proves nothing, which is why moving the reads
 * server-side without this would have been pure theatre.
 */
export async function sessionFromToken(token) {
  if (!token) return null
  const { data: sess } = await supabase
    .from('auth_sessions')
    .select('address, chain, expires_at')
    .eq('token', hash(token))
    .gt('expires_at', new Date().toISOString())
    .single()
  if (!sess) return null

  const { data: profile } = await supabase.rpc('get_or_create_profile', {
    p_address: sess.address,
    p_chain: sess.chain,
  })
  if (!profile) return null

  return {
    address:    sess.address,
    chain:      sess.chain,
    profileId:  profile.profile_id,
    username:   profile.username,
    addresses:  profile.addresses || [sess.address],
  }
}
