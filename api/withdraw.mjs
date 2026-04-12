import { createClient } from '@supabase/supabase-js'
import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')

function getVaultKeypair() {
  const secret = process.env.PLATFORM_VAULT_SECRET
  if (!secret) throw new Error('PLATFORM_VAULT_SECRET not set')
  const secretKey = Buffer.from(secret, 'base64')
  return Keypair.fromSecretKey(secretKey)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { wallet_address, amount_lamports } = req.body

  if (!wallet_address || !amount_lamports) {
    return res.status(400).json({ error: 'Missing wallet_address or amount_lamports' })
  }

  try {
    // Check user balance in Supabase
    const { data: balData, error: balError } = await supabase
      .from('user_balances')
      .select('balance_lamports')
      .eq('wallet_address', wallet_address)
      .single()

    if (balError || !balData) {
      return res.status(404).json({ error: 'User balance not found' })
    }

    if (balData.balance_lamports < amount_lamports) {
      return res.status(400).json({ error: 'Insufficient balance' })
    }

    const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
    const vaultKeypair = getVaultKeypair()

    // Find vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_vault')],
      PROGRAM_ID
    )

    // Check vault has enough SOL
    const vaultBalance = await connection.getBalance(vaultPda)
    if (vaultBalance < amount_lamports) {
      return res.status(400).json({ error: 'Vault has insufficient funds' })
    }

    // For devnet: send directly from vault keypair to user
    // On mainnet this would use the program's withdraw instruction
    const userPubkey = new PublicKey(wallet_address)

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: vaultKeypair.publicKey,
        toPubkey: userPubkey,
        lamports: amount_lamports,
      })
    )

    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = vaultKeypair.publicKey

    tx.sign(vaultKeypair)
    const sig = await connection.sendRawTransaction(tx.serialize())
    await connection.confirmTransaction(sig, 'confirmed')

    // Deduct from Supabase balance
    await supabase.from('user_balances')
      .update({
        balance_lamports: balData.balance_lamports - amount_lamports,
        total_withdrawn: amount_lamports,
        updated_at: new Date().toISOString()
      })
      .eq('wallet_address', wallet_address)

    return res.status(200).json({ ok: true, signature: sig })

  } catch (err) {
    console.error('Withdraw error:', err)
    return res.status(500).json({ error: err.message || 'Withdrawal failed' })
  }
}
