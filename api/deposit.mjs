import { createClient } from '@supabase/supabase-js'
import { Connection, PublicKey } from '@solana/web3.js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')

const [VAULT_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('platform_vault')],
  PROGRAM_ID
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { signature, wallet_address } = req.body || {}
  if (!signature || !wallet_address) {
    return res.status(400).json({ error: 'missing_params' })
  }

  try {
    const connection = new Connection(RPC_URL, 'finalized')

    // 1. Fetch the transaction. 'finalized' — not 'confirmed' — so it can't be rolled back.
    const tx = await connection.getTransaction(signature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx) return res.status(400).json({ error: 'tx_not_found_or_not_finalized' })

    // 2. It must have succeeded on-chain.
    if (tx.meta?.err) return res.status(400).json({ error: 'tx_failed' })

    // 3. Derive the actual lamports delta on the vault account.
    //    Do NOT trust any amount the client sends — read it from the chain.
    const keys = tx.transaction.message.staticAccountKeys ?? tx.transaction.message.accountKeys
    const vaultIndex = keys.findIndex((k) => k.equals(VAULT_PDA))
    if (vaultIndex === -1) return res.status(400).json({ error: 'not_a_vault_deposit' })

    const lamports = tx.meta.postBalances[vaultIndex] - tx.meta.preBalances[vaultIndex]
    if (!lamports || lamports <= 0) return res.status(400).json({ error: 'no_vault_credit' })

    // 4. The signer must be the wallet claiming the deposit.
    const signerIndex = 0
    if (keys[signerIndex].toBase58() !== wallet_address) {
      return res.status(403).json({ error: 'signer_mismatch' })
    }

    // 5. Credit atomically. The unique index on signature makes replay impossible:
    //    a second call with the same signature fails here, before any credit.
    const { error } = await supabase.rpc('credit_deposit', {
      p_wallet: wallet_address,
      p_lamports: lamports,
      p_signature: signature,
    })

    if (error) {
      if (String(error.message).includes('already_processed')) {
        return res.status(409).json({ error: 'deposit_already_credited' })
      }
      throw error
    }

    return res.status(200).json({ ok: true, lamports })
  } catch (err) {
    console.error('deposit error:', err.message)
    return res.status(500).json({ error: 'deposit_failed' })
  }
}
