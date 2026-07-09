import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ARC_RPC = 'https://rpc.testnet.arc.network'
const PREDARENA_ADDRESS = '0xA6D45CA5DF71F064193Fcbb139252032D5950a9E'
const USDC_DECIMALS = 6
const ODDS_DECIMALS = 10000

const BET_PLACED = parseAbiItem(
  'event BetPlaced(uint256 indexed ticketId, uint256 indexed battleId, address indexed player, uint8 side, uint256 stake, uint256 guaranteedOdds)'
)

const client = createPublicClient({ transport: http(ARC_RPC) })

const ERROR_STATUS = {
  betting_locked:      403,
  battle_not_live:     403,
  battle_not_found:    404,
  tx_already_recorded: 409,
  invalid_side:        400,
  invalid_stake:       400,
  invalid_odds:        400,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { battle_id, tx_hash } = req.body || {}
  if (!battle_id || !tx_hash) return res.status(400).json({ error: 'missing_params' })

  try {
    // 1. The transaction must exist and have succeeded.
    const receipt = await client.getTransactionReceipt({ hash: tx_hash })
    if (!receipt) return res.status(400).json({ error: 'tx_not_found' })
    if (receipt.status !== 'success') return res.status(400).json({ error: 'tx_failed' })

    // 2. Find the BetPlaced log emitted by OUR contract. Everything the client
    //    claims is ignored — side, stake, odds, and player are read from chain.
    const log = receipt.logs.find(
      (l) => l.address.toLowerCase() === PREDARENA_ADDRESS.toLowerCase()
    )
    if (!log) return res.status(400).json({ error: 'no_contract_log' })

    let decoded
    try {
      decoded = decodeEventLog({ abi: [BET_PLACED], data: log.data, topics: log.topics })
    } catch {
      return res.status(400).json({ error: 'not_a_bet_placed_event' })
    }
    if (decoded.eventName !== 'BetPlaced') {
      return res.status(400).json({ error: 'not_a_bet_placed_event' })
    }

    const { player, side, stake, guaranteedOdds, battleId } = decoded.args

    // 3. Cross-check the on-chain battleId against the Supabase battle row.
    const { data: battle, error: bErr } = await supabase
      .from('battles')
      .select('id, arc_battle_id')
      .eq('id', battle_id)
      .single()
    if (bErr || !battle) return res.status(404).json({ error: 'battle_not_found' })

    if (battle.arc_battle_id != null && BigInt(battle.arc_battle_id) !== battleId) {
      return res.status(400).json({ error: 'battle_id_mismatch' })
    }

    // 4. Record, using only chain-derived values.
    const { data, error } = await supabase.rpc('record_arc_ticket', {
      p_battle_id: battle_id,
      p_wallet: player,
      p_side: Number(side),
      p_stake: Number(stake) / 10 ** USDC_DECIMALS,
      p_odds: Number(guaranteedOdds) / ODDS_DECIMALS,
      p_tx_hash: tx_hash,
    })

    if (error) {
      const key = Object.keys(ERROR_STATUS).find((k) => String(error.message).includes(k))
      if (key) return res.status(ERROR_STATUS[key]).json({ error: key })
      console.error('record_arc_ticket error:', error.message)
      return res.status(500).json({ error: 'record_failed' })
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('place-bet-arc error:', err.message)
    return res.status(500).json({ error: 'arc_bet_failed' })
  }
}
