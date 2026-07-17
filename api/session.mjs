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
    expires_at: expiresAt.toISOString(),
  })
}

/** Shared by every authenticated read. Returns the address, or null. */
export async function addressFromToken(token) {
  if (!token) return null
  const { data } = await supabase
    .from('auth_sessions')
    .select('address, chain, expires_at')
    .eq('token', hash(token))
    .gt('expires_at', new Date().toISOString())
    .single()
  return data || null
}
