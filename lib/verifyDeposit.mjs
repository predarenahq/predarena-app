import { Connection, PublicKey } from '@solana/web3.js'

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')

const [VAULT_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('platform_vault')],
  PROGRAM_ID
)

/**
 * Verify a deposit transaction on-chain. Single source of truth for both the
 * request path (/api/deposit) and the sweep (cron).
 *
 * Returns one of:
 *   { status: 'pending' }                       — not finalized yet, retry later
 *   { status: 'invalid', reason }               — will never be creditable
 *   { status: 'ok', lamports, signer }          — safe to credit
 *
 * The lamports value is ALWAYS read from the chain, never from a caller.
 */
export async function verifyDeposit(signature, expectedWallet, { attempts = 1, delayMs = 0 } = {}) {
  const connection = new Connection(RPC_URL, 'finalized')

  let tx = null
  for (let i = 0; i < attempts; i++) {
    tx = await connection.getTransaction(signature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    })
    if (tx) break
    if (delayMs && i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs))
  }

  if (!tx) return { status: 'pending' }
  if (tx.meta?.err) return { status: 'invalid', reason: 'tx_failed' }

  const keys = tx.transaction.message.staticAccountKeys ?? tx.transaction.message.accountKeys
  const vaultIndex = keys.findIndex((k) => k.equals(VAULT_PDA))
  if (vaultIndex === -1) return { status: 'invalid', reason: 'not_a_vault_deposit' }

  const lamports = tx.meta.postBalances[vaultIndex] - tx.meta.preBalances[vaultIndex]
  if (!lamports || lamports <= 0) return { status: 'invalid', reason: 'no_vault_credit' }

  const signer = keys[0].toBase58()
  if (expectedWallet && signer !== expectedWallet) {
    return { status: 'invalid', reason: 'signer_mismatch' }
  }

  return { status: 'ok', lamports, signer }
}
