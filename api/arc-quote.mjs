import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { randomBytes } from 'crypto'
import { priceLeg, MAX_SINGLE_ODDS } from './lib/oddsEngine.mjs'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}
if (!process.env.ARC_QUOTER_PRIVATE_KEY) {
  throw new Error('ARC_QUOTER_PRIVATE_KEY is required')
}

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ARC_RPC           = 'https://rpc.testnet.arc.network'
const ARC_CHAIN_ID      = 5042002
const PREDARENA_ADDRESS = '0x71B30dF164c0441Dc9DF5a156D02efaB103096E3'
const USDC_DECIMALS     = 6
const ODDS_DECIMALS     = 10000
const MIN_ODDS_RAW      = 10100
const MAX_ODDS_RAW      = 100000
const QUOTE_TTL_SECONDS = 60
const BETTING_LOCK      = 0.8

const client  = createPublicClient({ transport: http(ARC_RPC) })
const account = privateKeyToAccount(process.env.ARC_QUOTER_PRIVATE_KEY)

const SOL_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
const PYTH_FEEDS = {
  BTC:  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL:  SOL_FEED,
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  BNB:  '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  XRP:  '0xec5d399846a9209f3fe5881d70aae9268c7b040d3ce7b657b5af68ee9e46cd07',
  DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  UNI:  '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
  PEPE: '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
  JUP:  '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  WIF:  '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
  BONK: '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
}

const FREE_CAPITAL_ABI = [{
  name: 'freeCapital', type: 'function', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'uint256' }],
}]

const EIP712_DOMAIN = {
  name: 'PredArena',
  version: '1',
  chainId: ARC_CHAIN_ID,
  verifyingContract: PREDARENA_ADDRESS,
}

const QUOTE_TYPES = {
  Quote: [
    { name: 'player',   type: 'address' },
    { name: 'battleId', type: 'uint256' },
    { name: 'side',     type: 'uint8'   },
    { name: 'stake',    type: 'uint256' },
    { name: 'odds',     type: 'uint256' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
}

async function getPythPrices(tickers) {
  const results = {}
  const valid = [...new Set(tickers)].filter((t) => PYTH_FEEDS[t])
  await Promise.all(valid.map(async (ticker) => {
    try {
      const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`)
      if (!res.ok) return
      const parsed = (await res.json())?.parsed?.[0]
      if (!parsed) return
      results[ticker] = Number(parsed.price.price) * Math.pow(10, parsed.price.expo)
    } catch (err) {
      console.error(`Pyth error for ${ticker}:`, err.message)
    }
  }))
  return results
}

/**
 * Signs an odds quote for an Arc bet.
 *
 * PredArena will not accept a bet without an EIP-712 signature from the quoter
 * key. That is deliberate: the old contract let the bettor pass their own
 * `guaranteedOdds`, so anyone could mint a 10x ticket and drain it. The server
 * prices the leg (same engine as the Solana path) and signs the result; the
 * contract verifies the signature and the bettor cannot touch the number.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { player, battle_id, side, stake } = req.body || {}

  if (!player || !/^0x[a-fA-F0-9]{40}$/.test(player)) return res.status(400).json({ error: 'invalid_player' })
  if (!battle_id) return res.status(400).json({ error: 'missing_battle_id' })
  if (![1, 2, 3].includes(Number(side))) return res.status(400).json({ error: 'invalid_side' })
  if (!(Number(stake) > 0)) return res.status(400).json({ error: 'invalid_stake' })

  try {
    // A null arc_battle_id means there is nothing on Arc to bet against - so no
    // quote, and therefore no bet. This closes the old cross-check hole at the
    // source: an unmapped battle simply cannot be quoted.
    const { data: battle, error: bErr } = await supabase
      .from('battles')
      .select('*')
      .eq('id', battle_id)
      .single()
    if (bErr || !battle) return res.status(404).json({ error: 'battle_not_found' })
    if (battle.arc_battle_id == null) return res.status(400).json({ error: 'battle_not_on_arc' })
    if (battle.status !== 'live') return res.status(403).json({ error: 'battle_not_live' })

    const now     = Date.now()
    const startMs = new Date(battle.start_time).getTime()
    const endMs   = new Date(battle.end_time).getTime()
    if (now >= endMs) return res.status(403).json({ error: 'battle_ended' })
    if (endMs > startMs && (now - startMs) / (endMs - startMs) >= BETTING_LOCK) {
      return res.status(403).json({ error: 'betting_locked' })
    }

    const prices = await getPythPrices([battle.coin_a, battle.coin_b])
    if (!(prices[battle.coin_a] > 0) || !(prices[battle.coin_b] > 0)) {
      return res.status(503).json({ error: 'pricing_unavailable' })
    }

    const sideNum    = Number(side)
    const serverOdds = priceLeg(battle, prices, now)[sideNum]
    if (!(serverOdds >= 1.01)) return res.status(400).json({ error: 'invalid_odds' })
    if (serverOdds > MAX_SINGLE_ODDS) return res.status(400).json({ error: 'odds_too_high' })

    const oddsRaw = BigInt(Math.round(serverOdds * ODDS_DECIMALS))
    if (oddsRaw < BigInt(MIN_ODDS_RAW) || oddsRaw > BigInt(MAX_ODDS_RAW)) {
      return res.status(400).json({ error: 'invalid_odds' })
    }

    const stakeRaw = BigInt(Math.round(Number(stake) * 10 ** USDC_DECIMALS))
    if (stakeRaw <= 0n) return res.status(400).json({ error: 'invalid_stake' })

    // Refuse a quote the book cannot back. The contract would revert with
    // insufficient_liquidity anyway - better to say so before the user pays gas.
    const payoutRaw = (stakeRaw * oddsRaw) / BigInt(ODDS_DECIMALS)
    const freeCapital = await client.readContract({
      address: PREDARENA_ADDRESS,
      abi: FREE_CAPITAL_ABI,
      functionName: 'freeCapital',
    })
    if (payoutRaw - stakeRaw > freeCapital) {
      return res.status(402).json({
        error: 'insufficient_liquidity',
        max_payout_backable: (Number(freeCapital) / 10 ** USDC_DECIMALS).toFixed(2),
      })
    }

    // Bound to this player/battle/side/stake, dead in 60s. One quote, one bet:
    // the contract burns the digest on use.
    const nonce    = BigInt('0x' + randomBytes(16).toString('hex'))
    const deadline = BigInt(Math.floor(now / 1000) + QUOTE_TTL_SECONDS)

    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: QUOTE_TYPES,
      primaryType: 'Quote',
      message: {
        player,
        battleId: BigInt(battle.arc_battle_id),
        side:     sideNum,
        stake:    stakeRaw,
        odds:     oddsRaw,
        nonce,
        deadline,
      },
    })

    return res.status(200).json({
      predarena:     PREDARENA_ADDRESS,
      chain_id:      ARC_CHAIN_ID,
      battle_id:     battle_id,
      arc_battle_id: String(battle.arc_battle_id),
      side:          sideNum,
      stake:         String(stakeRaw),
      odds:          String(oddsRaw),
      odds_display:  Number(serverOdds.toFixed(2)),
      nonce:         String(nonce),
      deadline:      String(deadline),
      signature,
    })
  } catch (err) {
    console.error('arc-quote error:', err.message)
    return res.status(500).json({ error: 'quote_failed' })
  }
}
