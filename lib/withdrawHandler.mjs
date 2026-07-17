import { createClient } from '@supabase/supabase-js'
import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js'
import nacl from 'tweetnacl'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const SOL_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
const WITHDRAWAL_FEE = 0.01 // 1% kept in the vault

function getVaultKeypair() {
  const secret = process.env.PLATFORM_VAULT_SECRET
  if (!secret) throw new Error('PLATFORM_VAULT_SECRET not set')
  const trimmed = secret.trim()
  let bytes
  if (trimmed.startsWith('[')) {
    // raw Solana keypair file contents: [12,255,...]
    bytes = Uint8Array.from(JSON.parse(trimmed))
  } else {
    // base64-encoded 64-byte secret
    bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'))
  }
  if (bytes.length !== 64) {
    throw new Error(`vault secret decoded to ${bytes.length} bytes, expected 64`)
  }
  return Keypair.fromSecretKey(bytes)
}

async function getSolPrice() {
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_FEED}`)
  if (!res.ok) return null
  const p = (await res.json())?.parsed?.[0]?.price
  if (!p || typeof p.price === 'undefined') return null
  const price = Number(p.price) * Math.pow(10, p.expo)
  return price > 0 ? price : null
}

export async function withdrawHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { wallet_address, amount_lamports, signature, message } = req.body || {}

  // --- Validate inputs. amount must be a positive integer. ---
  if (!wallet_address) return res.status(400).json({ error: 'missing_wallet' })
  const amount = Number(amount_lamports)
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount' })
  }

  // --- Prove the caller owns wallet_address by verifying an ed25519 signature
  //     over a message that names the amount. Without this, anyone could force
  //     a withdrawal for any wallet. (Interim scheme until Privy lands.) ---
  if (!signature || !message) {
    return res.status(401).json({ error: 'signature_required' })
  }
  try {
    const expectedPrefix = `PredArena withdraw ${amount} to ${wallet_address}`
    if (!String(message).startsWith(expectedPrefix)) {
      return res.status(401).json({ error: 'message_mismatch' })
    }
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      Buffer.from(signature, 'base64'),
      new PublicKey(wallet_address).toBytes()
    )
    if (!ok) return res.status(401).json({ error: 'bad_signature' })
  } catch {
    return res.status(401).json({ error: 'bad_signature' })
  }

  const feeAmount = Math.floor(amount * WITHDRAWAL_FEE)
  const netAmount = amount - feeAmount
  if (netAmount <= 0) return res.status(400).json({ error: 'amount_too_small' })

  try {
    // --- 1. ATOMIC DEBIT FIRST. The `>= amount` guard lives inside the UPDATE,
    //        so concurrent withdrawals can't both pass. We debit BEFORE sending
    //        SOL; if the send fails we refund. This is the reverse of the old
    //        order (send-then-debit), which lost money on any crash. ---
    const { data: debited, error: debitErr } = await supabase.rpc('debit_balance', {
      p_wallet: wallet_address, p_lamports: amount,
    })
    if (debitErr) {
      if (String(debitErr.message).includes('insufficient_balance')) {
        return res.status(400).json({ error: 'insufficient_balance' })
      }
      if (String(debitErr.message).includes('no_balance_row')) {
        return res.status(404).json({ error: 'balance_not_found' })
      }
      throw debitErr
    }

    // --- 2. Send net SOL from the custodial vault wallet. ---
    let sig
    try {
      const connection = new Connection(RPC_URL, 'confirmed')
      const vault = getVaultKeypair()

      const vaultBalance = await connection.getBalance(vault.publicKey)
      if (vaultBalance < netAmount) {
        // Refund the ledger — we never sent anything.
        await supabase.rpc('credit_balance', { p_wallet: wallet_address, p_lamports: amount })
        return res.status(503).json({ error: 'vault_insufficient_funds' })
      }

      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: vault.publicKey,
        toPubkey: new PublicKey(wallet_address),
        lamports: netAmount,
      }))
      const { blockhash } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = vault.publicKey
      tx.sign(vault)
      sig = await connection.sendRawTransaction(tx.serialize())
      await connection.confirmTransaction(sig, 'confirmed')
    } catch (sendErr) {
      // Send failed after the debit — refund so the user isn't charged for SOL
      // they never received. credit_balance is atomic.
      await supabase.rpc('credit_balance', { p_wallet: wallet_address, p_lamports: amount })
      console.error('withdraw send failed, refunded:', sendErr.message)
      return res.status(502).json({ error: 'send_failed' })
    }

    // --- 3. Bookkeeping: lifetime total (incremented) + fee ledger. Best-effort;
    //        the money already moved correctly, so these must not fail the call. ---
    await supabase.rpc('increment_withdrawn', { p_wallet: wallet_address, p_lamports: amount })

    try {
      const solPrice = await getSolPrice()
      if (solPrice) {
        const feeUsd = (feeAmount / 1_000_000_000) * solPrice
        // atomic ledger update, scoped to the single treasury row
        await supabase.rpc('apply_treasury_delta', { p_stakes_in: feeUsd, p_payouts_out: 0 })
      }
    } catch (feeErr) {
      console.error('withdraw fee accounting failed (non-fatal):', feeErr.message)
    }

    return res.status(200).json({ ok: true, signature: sig, fee_lamports: feeAmount, net_lamports: netAmount })
  } catch (err) {
    console.error('withdraw error:', err.message)
    return res.status(500).json({ error: 'withdrawal_failed' })
  }
}
