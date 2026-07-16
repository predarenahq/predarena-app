import { createClient } from '@supabase/supabase-js'
import { createWalletClient, createPublicClient, http, parseEther, formatEther, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
if (!process.env.ARC_FAUCET_PRIVATE_KEY)    throw new Error('ARC_FAUCET_PRIVATE_KEY is required')

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ARC_RPC      = process.env.ARC_RPC_URL || 'https://arc-testnet.drpc.org'
const ARC_CHAIN_ID = 5042002

// Arc's NATIVE token is 18dp (the ERC-20 interface is 6dp). parseEther is the
// right unit here: this is a native send.
const DRIP_WEI      = parseEther('2')   // 2 USDC per claim
const DAILY_CAP_WEI = parseEther('20')  // total across ALL claimants per 24h
const COOLDOWN_MS   = 24 * 60 * 60 * 1000
const RESERVE_WEI   = parseEther('0.5') // keep enough to pay our own gas

const arcChain = {
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
}

const account      = privateKeyToAccount(process.env.ARC_FAUCET_PRIVATE_KEY)
const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
const walletClient = createWalletClient({ account, chain: arcChain, transport: http(ARC_RPC) })

/**
 * Dispenses testnet USDC to a logged-in user.
 *
 * One NATIVE transfer does both jobs: on Arc the native balance and the USDC
 * ERC-20 interface at 0x3600... are the same underlying balance, so a plain
 * send gives the recipient gas AND bettable USDC. No approve, no token call.
 *
 * Two limits:
 *   1. per address    - one claim per 24h
 *   2. global per day - the one that actually matters. A per-address cooldown
 *      alone is free money to anyone generating addresses in a loop; the daily
 *      ceiling bounds the worst case to a single refill of testnet funds.
 *
 * The signing key holds ~20 USDC and NOTHING else: it is not admin, not keeper,
 * not the quoter. If this endpoint is ever exploited, the loss is the wallet.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  // 1. Normalize the address. Stored checksummed so it matches tickets, which
  //    come from on-chain events.
  let address
  try {
    address = getAddress(String(req.body?.address || ''))
  } catch {
    return res.status(400).json({ error: 'invalid_address' })
  }

  try {
    const since = new Date(Date.now() - COOLDOWN_MS).toISOString()

    // 2. Per-address cooldown.
    const { data: addrClaims } = await supabase
      .from('arc_faucet_claims').select('created_at')
      .eq('address', address).gte('created_at', since).limit(1)
    if (addrClaims?.length) {
      return res.status(429).json({ error: 'already_claimed', retry_after_hours: 24 })
    }

    // 3. Global daily cap.
    const { data: recent } = await supabase
      .from('arc_faucet_claims').select('amount_wei').gte('created_at', since)
    const spent = (recent || []).reduce((t, r) => t + BigInt(r.amount_wei), BigInt(0))
    if (spent + DRIP_WEI > DAILY_CAP_WEI) {
      return res.status(429).json({ error: 'daily_cap_reached' })
    }

    // 4. Can we actually pay? Say so before promising anything.
    const balance = await publicClient.getBalance({ address: account.address })
    if (balance < DRIP_WEI + RESERVE_WEI) {
      return res.status(503).json({
        error: 'faucet_empty',
        faucet_balance: formatEther(balance),
      })
    }

    // 5. Send, wait, then record. Recording only after confirmation means a
    //    failed send never burns the user's 24h window.
    const hash = await walletClient.sendTransaction({ to: address, value: DRIP_WEI })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      return res.status(502).json({ error: 'transfer_failed', tx_hash: hash })
    }

    await supabase.from('arc_faucet_claims').insert({
      address,
      amount_wei: DRIP_WEI.toString(),
      tx_hash: hash,
    })

    return res.status(200).json({
      ok: true,
      tx_hash: hash,
      amount: formatEther(DRIP_WEI),
      explorer: `https://testnet.arcscan.app/tx/${hash}`,
    })
  } catch (err) {
    console.error('arc-faucet error:', err?.shortMessage || err?.message)
    return res.status(500).json({ error: 'faucet_failed' })
  }
}
