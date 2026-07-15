import { createClient } from '@supabase/supabase-js'
import { ethers } from 'ethers'

// ── Setup ─────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
)

const ARC_RPC     = 'https://rpc.testnet.arc.network'
const PREDARENA   = '0x71B30dF164c0441Dc9DF5a156D02efaB103096E3'

const KEEPER_ABI = [
  'function createBattle(string coinA, string coinB, string league, string duration, uint256 startTime, uint256 endTime, uint256 startPriceA, uint256 startPriceB) returns (uint256 battleId)',
  'function settleBattle(uint256 battleId, uint256 finalPriceA, uint256 finalPriceB)',
  'function nextBattleId() view returns (uint256)',
  'event BattleCreated(uint256 indexed id, string coinA, string coinB, uint256 startTime, uint256 endTime)',
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

// USD float → uint256 with 8 decimal places (e.g. 65000.5 → 6500050000000n)
function toPrice(usd) {
  return BigInt(Math.round(usd * 1e8))
}

async function getPythPrices(tickers) {
  const results = {}
  await Promise.all(tickers.filter(t => PYTH_FEEDS[t]).map(async (ticker) => {
    try {
      const res  = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`)
      const data = await res.json()
      const p    = data?.parsed?.[0]
      if (p) results[ticker] = Number(p.price.price) * Math.pow(10, p.price.expo)
    } catch {}
  }))
  return results
}

// ── Create Arc battles ────────────────────────────────────────────────────────

async function createArcBattles(contract) {
  const now = new Date().toISOString()

  // Claim the rows before touching the chain. Two keeper runs overlapping (the
  // cron firing during a manual trigger, say) would otherwise each create the
  // same battle on-chain - which is exactly what happened, leaving orphaned
  // duplicates. This UPDATE is atomic, so the loser's filter matches nothing.
  // Release claims abandoned by a killed run. The catch below frees a claim on
  // error, but a serverless timeout kills the function without running it - and
  // a row stuck in 'creating' is invisible to every future run: arc_battle_id is
  // null but arc_status isn't, so nothing ever picks it up again.
  await supabase
    .from('battles')
    .update({ arc_status: null, arc_claimed_at: null })
    .eq('arc_status', 'creating')
    .lt('arc_claimed_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

  const { data: battles } = await supabase
    .from('battles')
    .update({ arc_status: 'creating', arc_claimed_at: new Date().toISOString() })
    .is('arc_battle_id', null)
    .is('arc_status', null)
    .eq('status', 'live')
    .gt('end_time', now)
    .select()

  if (!battles?.length) return { created: 0 }

  let created = 0
  for (const b of battles) {
    try {
      const startTime = BigInt(Math.floor(new Date(b.start_time).getTime() / 1000))
      const endTime   = BigInt(Math.floor(new Date(b.end_time).getTime() / 1000))

      const tx = await contract.createBattle(
        b.coin_a, b.coin_b,
        b.league   || 'Major',
        b.duration || '1h',
        startTime, endTime,
        toPrice(b.start_price_a),
        toPrice(b.start_price_b)
      )
      const receipt = await tx.wait()

      // Take the id from the BattleCreated event, NOT from a pre-read of
      // nextBattleId(). The old code read the counter and then assumed its own
      // tx got that number. If anything else created a battle in the gap, it
      // recorded an id belonging to someone else's battle - and every quote
      // signed against that mapping would put the user's money on the wrong
      // fixture. The event is what the chain actually did.
      let realId = null
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data })
          if (parsed?.name === 'BattleCreated') { realId = parsed.args.id; break }
        } catch { /* not one of ours */ }
      }
      if (realId == null) throw new Error('no BattleCreated event in receipt')

      await supabase.from('battles').update({
        arc_battle_id:     Number(realId),
        arc_status:        'live',
        arc_claimed_at:    null,
        arc_start_price_a: b.start_price_a,
        arc_start_price_b: b.start_price_b,
      }).eq('id', b.id)

      created++
      console.log(`Arc battle ${realId} created: ${b.coin_a} vs ${b.coin_b}`)
    } catch (err) {
      // Release the claim so the next run can retry this battle.
      await supabase.from('battles').update({ arc_status: null, arc_claimed_at: null }).eq('id', b.id)
      console.error(`Create failed for ${b.id}:`, err.message)
    }
  }
  return { created }
}

// ── Settle Arc battles ────────────────────────────────────────────────────────

async function settleArcBattles(contract) {
  const now = new Date().toISOString()
  const { data: battles } = await supabase
    .from('battles')
    .select('*')
    .not('arc_battle_id', 'is', null)
    .eq('arc_status', 'live')
    .lte('end_time', now)

  if (!battles?.length) return { settled: 0 }

  const tickers    = [...new Set(battles.flatMap(b => [b.coin_a, b.coin_b]))]
  const livePrices = await getPythPrices(tickers)

  let settled = 0
  for (const b of battles) {
    try {
      const twapCutoff = new Date(Date.now() - 90 * 1000).toISOString()
      const [twapA, twapB] = await Promise.all([
        supabase.from('price_history').select('price').eq('coin', b.coin_a)
          .gte('recorded_at', twapCutoff).order('recorded_at', { ascending: false }).limit(10),
        supabase.from('price_history').select('price').eq('coin', b.coin_b)
          .gte('recorded_at', twapCutoff).order('recorded_at', { ascending: false }).limit(10),
      ])

      const finalPriceA = twapA.data?.length >= 2
        ? twapA.data.reduce((s, r) => s + r.price, 0) / twapA.data.length
        : livePrices[b.coin_a]

      const finalPriceB = twapB.data?.length >= 2
        ? twapB.data.reduce((s, r) => s + r.price, 0) / twapB.data.length
        : livePrices[b.coin_b]

      if (!finalPriceA || !finalPriceB) {
        console.log(`⚠️ Missing prices for ${b.coin_a}/${b.coin_b}`)
        continue
      }

      const tx = await contract.settleBattle(
        BigInt(b.arc_battle_id),
        toPrice(finalPriceA),
        toPrice(finalPriceB)
      )
      await tx.wait()

      await supabase.from('battles').update({ arc_status: 'settled' }).eq('id', b.id)
      settled++
      console.log(`✅ Settled Arc battle ${b.arc_battle_id}: ${b.coin_a} vs ${b.coin_b}`)
    } catch (err) {
      console.error(`❌ Settle failed for arc_battle_id ${b.arc_battle_id}:`, err.message)
    }
  }
  return { settled }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // This endpoint creates and settles battles on-chain with the keeper key. It
  // was reachable by anyone who knew the URL. Same shared secret as /api/cron;
  // note the !secret check - without it, an unset CRON_SECRET would make
  // `undefined !== undefined` false and let every request through.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const privateKey = process.env.KEEPER_PRIVATE_KEY
  if (!privateKey) return res.status(500).json({ error: 'KEEPER_PRIVATE_KEY not set' })

  const provider = new ethers.JsonRpcProvider(ARC_RPC)
  const keeper   = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(PREDARENA, KEEPER_ABI, keeper)

  const results = { ok: true, timestamp: new Date().toISOString() }

  try { results.createArcBattles  = await createArcBattles(contract)  } catch (e) { results.createError  = e.message }
  try { results.settleArcBattles  = await settleArcBattles(contract)  } catch (e) { results.settleError  = e.message }

  res.status(200).json(results)
}
