import { createClient } from '@supabase/supabase-js'
import { createPublicClient, createWalletClient, http, privateKeyToAccount } from 'viem'

// ── Setup ─────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
)

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' } },
}

const PREDARENA_ADDRESS = '0xA6D45CA5DF71F064193Fcbb139252032D5950a9E'

const KEEPER_ABI = [
  {
    type: 'function', name: 'createBattle', stateMutability: 'nonpayable',
    inputs: [
      { name: 'coinA',        type: 'string'  },
      { name: 'coinB',        type: 'string'  },
      { name: 'league',       type: 'string'  },
      { name: 'duration',     type: 'string'  },
      { name: 'startTime',    type: 'uint256' },
      { name: 'endTime',      type: 'uint256' },
      { name: 'startPriceA',  type: 'uint256' },
      { name: 'startPriceB',  type: 'uint256' },
    ],
    outputs: [{ name: 'battleId', type: 'uint256' }],
  },
  {
    type: 'function', name: 'settleBattle', stateMutability: 'nonpayable',
    inputs: [
      { name: 'battleId',    type: 'uint256' },
      { name: 'finalPriceA', type: 'uint256' },
      { name: 'finalPriceB', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'nextBattleId', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
]

const PYTH_FEEDS = {
  BTC:  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL:  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
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

// Convert USD float to uint256 with 8 decimal places
// e.g. 65000.5 → 6500050000000n
function toContractPrice(usdPrice) {
  return BigInt(Math.round(usdPrice * 1e8))
}

// Fetch live Pyth prices for a list of tickers
async function getPythPrices(tickers) {
  const results = {}
  const valid = tickers.filter(t => PYTH_FEEDS[t])
  await Promise.all(valid.map(async (ticker) => {
    try {
      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`
      const res  = await fetch(url)
      if (!res.ok) return
      const data   = await res.json()
      const parsed = data?.parsed?.[0]
      if (!parsed) return
      results[ticker] = Number(parsed.price.price) * Math.pow(10, parsed.price.expo)
    } catch (err) {
      console.error(`Pyth error for ${ticker}:`, err.message)
    }
  }))
  return results
}

// ── Create Arc battles ────────────────────────────────────────────────────────
// Mirrors Supabase 'live' battles onto the Arc contract.
// Skips battles that already have an arc_battle_id or have already ended.

async function createArcBattles(walletClient, publicClient, keeperAccount) {
  const now = new Date().toISOString()

  const { data: battles } = await supabase
    .from('battles')
    .select('*')
    .is('arc_battle_id', null)
    .eq('status', 'live')
    .gt('end_time', now)   // only battles still running

  if (!battles?.length) return { created: 0 }

  let created = 0

  for (const battle of battles) {
    try {
      // Read nextBattleId — this will be the ID assigned to the new battle
      const nextId = await publicClient.readContract({
        address: PREDARENA_ADDRESS,
        abi:     KEEPER_ABI,
        functionName: 'nextBattleId',
      })

      const startPriceA = toContractPrice(battle.start_price_a)
      const startPriceB = toContractPrice(battle.start_price_b)
      const startTime   = BigInt(Math.floor(new Date(battle.start_time).getTime() / 1000))
      const endTime     = BigInt(Math.floor(new Date(battle.end_time).getTime() / 1000))

      const hash = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          KEEPER_ABI,
        functionName: 'createBattle',
        args: [
          battle.coin_a,
          battle.coin_b,
          battle.league   || 'Major',
          battle.duration || '1h',
          startTime,
          endTime,
          startPriceA,
          startPriceB,
        ],
        account: keeperAccount,
      })

      await publicClient.waitForTransactionReceipt({ hash })

      // Store Arc battle ID back in Supabase
      await supabase.from('battles').update({
        arc_battle_id:     Number(nextId),
        arc_status:        'live',
        arc_start_price_a: battle.start_price_a,
        arc_start_price_b: battle.start_price_b,
      }).eq('id', battle.id)

      created++
      console.log(`✅ Arc battle ${nextId} created for ${battle.coin_a} vs ${battle.coin_b} (Supabase id: ${battle.id})`)
    } catch (err) {
      console.error(`❌ Failed to create Arc battle for Supabase ${battle.id}:`, err.message)
    }
  }

  return { created }
}

// ── Settle Arc battles ────────────────────────────────────────────────────────
// Settles expired Arc battles using TWAP prices from price_history.
// Falls back to live Pyth price if not enough history samples.

async function settleArcBattles(walletClient, publicClient, keeperAccount) {
  const now = new Date().toISOString()

  const { data: battles } = await supabase
    .from('battles')
    .select('*')
    .not('arc_battle_id', 'is', null)
    .eq('arc_status', 'live')
    .lte('end_time', now)

  if (!battles?.length) return { settled: 0 }

  const tickers = [...new Set(battles.flatMap(b => [b.coin_a, b.coin_b]))]
  const livePrices = await getPythPrices(tickers)

  let settled = 0

  for (const battle of battles) {
    try {
      const twapCutoff = new Date(Date.now() - 90 * 1000).toISOString()

      const [twapA, twapB] = await Promise.all([
        supabase.from('price_history').select('price')
          .eq('coin', battle.coin_a).gte('recorded_at', twapCutoff)
          .order('recorded_at', { ascending: false }).limit(10),
        supabase.from('price_history').select('price')
          .eq('coin', battle.coin_b).gte('recorded_at', twapCutoff)
          .order('recorded_at', { ascending: false }).limit(10),
      ])

      const finalPriceA = twapA.data?.length >= 2
        ? twapA.data.reduce((s, r) => s + r.price, 0) / twapA.data.length
        : livePrices[battle.coin_a]

      const finalPriceB = twapB.data?.length >= 2
        ? twapB.data.reduce((s, r) => s + r.price, 0) / twapB.data.length
        : livePrices[battle.coin_b]

      if (!finalPriceA || !finalPriceB) {
        console.log(`⚠️ Missing prices for ${battle.coin_a}/${battle.coin_b} — skipping`)
        continue
      }

      const hash = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          KEEPER_ABI,
        functionName: 'settleBattle',
        args: [
          BigInt(battle.arc_battle_id),
          toContractPrice(finalPriceA),
          toContractPrice(finalPriceB),
        ],
        account: keeperAccount,
      })

      await publicClient.waitForTransactionReceipt({ hash })

      await supabase.from('battles').update({ arc_status: 'settled' }).eq('id', battle.id)

      settled++
      console.log(`✅ Settled Arc battle ${battle.arc_battle_id}: ${battle.coin_a} vs ${battle.coin_b}`)
    } catch (err) {
      console.error(`❌ Failed to settle Arc battle ${battle.arc_battle_id}:`, err.message)
    }
  }

  return { settled }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const privateKey = process.env.KEEPER_PRIVATE_KEY
  if (!privateKey) {
    return res.status(500).json({ error: 'KEEPER_PRIVATE_KEY not set' })
  }

  const keeperAccount = privateKeyToAccount(privateKey)

  const publicClient = createPublicClient({
    chain:     arcTestnet,
    transport: http('https://rpc.testnet.arc.network'),
  })

  const walletClient = createWalletClient({
    chain:     arcTestnet,
    transport: http('https://rpc.testnet.arc.network'),
  })

  const results = { ok: true, timestamp: new Date().toISOString() }

  try {
    results.createArcBattles = await createArcBattles(walletClient, publicClient, keeperAccount)
  } catch (err) {
    console.error('createArcBattles error:', err.message)
    results.createError = err.message
  }

  try {
    results.settleArcBattles = await settleArcBattles(walletClient, publicClient, keeperAccount)
  } catch (err) {
    console.error('settleArcBattles error:', err.message)
    results.settleError = err.message
  }

  res.status(200).json(results)
}
