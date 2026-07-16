import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ARC_RPC = process.env.ARC_RPC_URL || 'https://arc-testnet.drpc.org'
const PREDARENA_ADDRESS = '0x71B30dF164c0441Dc9DF5a156D02efaB103096E3'
const USDC_DECIMALS = 6
const ODDS_DECIMALS = 10000

// Matches the rewritten contract: `guaranteedOdds` is gone (the bettor no
// longer supplies odds - they're EIP-712 signed by the quoter), and `payout` is
// emitted so the mirror doesn't have to recompute it.
const BET_PLACED = parseAbiItem(
  'event BetPlaced(uint256 indexed ticketId, uint256 indexed battleId, address indexed player, uint8 side, uint256 stake, uint256 odds, uint256 payout)'
)

// A combo emits ComboPlaced instead of BetPlaced. Note what is NOT in it:
// per-leg odds. The contract validates oddsArr (their product must equal
// comboOdds) and then discards it, so the mirror cannot recover per-leg odds
// from the chain. The client sends them and we VERIFY the product against the
// on-chain comboOdds - checkable, not trusted.
const COMBO_PLACED = parseAbiItem(
  'event ComboPlaced(uint256 indexed comboId, address indexed player, uint256 stake, uint256 comboOdds, uint256 payout, uint256[] battleIds, uint8[] sides)'
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
  need_2_legs:         400,
  invalid_tx_hash:     400,
}

/**
 * Stamps the booking code onto the ticket rows this tx created.
 *
 * Exact, unlike the Solana path: every Arc ticket from one transaction carries
 * the same arc_tx_hash, so there is no wallet + battle-ids + 30s-window
 * heuristic to get wrong. Service role, because RLS blocks client UPDATEs on
 * tickets - which is exactly why the client-side stamp silently wrote nothing
 * and every share_code came back null.
 *
 * Best-effort: the bet is already on-chain and recorded. A failed stamp costs
 * the share code, not the bet.
 */
async function stampShareCode(supabase, txHash, code) {
  if (!code) return
  try {
    await supabase.from('tickets')
      .update({ share_code: code })
      .eq('arc_tx_hash', txHash)
      .is('share_code', null)
  } catch (err) {
    console.error('share_code stamp failed:', err?.message)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { battle_id, tx_hash, leg_odds, code } = req.body || {}
  if (!tx_hash) return res.status(400).json({ error: 'missing_params' })

  try {
    // 1. The transaction must exist and have succeeded.
    const receipt = await client.getTransactionReceipt({ hash: tx_hash })
    if (!receipt) return res.status(400).json({ error: 'tx_not_found' })
    if (receipt.status !== 'success') return res.status(400).json({ error: 'tx_failed' })

    // 2. Find the log emitted by OUR contract. Everything the client claims is
    //    ignored - player, side, stake and odds are read from chain.
    const log = receipt.logs.find(
      (l) => l.address.toLowerCase() === PREDARENA_ADDRESS.toLowerCase()
    )
    if (!log) return res.status(400).json({ error: 'no_contract_log' })

    let decoded
    let isCombo = false
    try {
      decoded = decodeEventLog({ abi: [BET_PLACED], data: log.data, topics: log.topics })
    } catch {
      try {
        decoded = decodeEventLog({ abi: [COMBO_PLACED], data: log.data, topics: log.topics })
        isCombo = true
      } catch {
        return res.status(400).json({ error: 'not_a_bet_placed_event' })
      }
    }

    // ---- COMBO ----------------------------------------------------------
    if (isCombo || decoded.eventName === 'ComboPlaced') {
      const { player, stake, comboOdds, battleIds, sides } = decoded.args

      if (!Array.isArray(leg_odds) || leg_odds.length !== battleIds.length) {
        return res.status(400).json({ error: 'leg_odds_mismatch' })
      }

      // Replicate the contract's own check, with its integer truncation:
      //   computed = ODDS_DECIMALS; computed = computed * odds[i] / ODDS_DECIMALS
      // If the client lies about a leg's odds the product breaks and we reject.
      const D = BigInt(ODDS_DECIMALS)
      let computed = D
      for (const o of leg_odds) {
        const raw = BigInt(o)
        if (raw < 10100n || raw > 100000n) return res.status(400).json({ error: 'invalid_odds' })
        computed = (computed * raw) / D
      }
      if (computed !== comboOdds) {
        return res.status(400).json({ error: 'leg_odds_mismatch' })
      }

      // Map on-chain ids back to Supabase battles. Derived from the EVENT, not
      // from anything the client sent.
      const arcIds = battleIds.map((b) => Number(b))
      const { data: rows, error: rErr } = await supabase
        .from('battles').select('id, arc_battle_id').in('arc_battle_id', arcIds)
      if (rErr) throw rErr
      const byArcId = new Map((rows || []).map((r) => [Number(r.arc_battle_id), r.id]))

      const legs = []
      for (let i = 0; i < arcIds.length; i++) {
        const uuid = byArcId.get(arcIds[i])
        if (!uuid) return res.status(404).json({ error: 'battle_not_found' })
        legs.push({
          battle_id: uuid,
          side: Number(sides[i]),
          odds: Number(leg_odds[i]) / ODDS_DECIMALS,
        })
      }

      const { data, error } = await supabase.rpc('record_arc_combo', {
        p_wallet: player,
        p_legs: legs,
        p_stake: Number(stake) / 10 ** USDC_DECIMALS,
        p_combo_odds: Number(comboOdds) / ODDS_DECIMALS,
        p_tx_hash: tx_hash,
      })
      if (error) {
        const key = Object.keys(ERROR_STATUS).find((k) => String(error.message).includes(k))
        if (key) return res.status(ERROR_STATUS[key]).json({ error: key })
        console.error('record_arc_combo error:', error.message)
        return res.status(500).json({ error: 'record_failed' })
      }
      await stampShareCode(supabase, tx_hash, code)
      return res.status(200).json(data)
    }

    // ---- SINGLE ---------------------------------------------------------
    if (!battle_id) return res.status(400).json({ error: 'missing_params' })
    const { player, side, stake, odds, battleId } = decoded.args

    // 3. Cross-check the on-chain battleId against the Supabase battle row.
    const { data: battle, error: bErr } = await supabase
      .from('battles')
      .select('id, arc_battle_id')
      .eq('id', battle_id)
      .single()
    if (bErr || !battle) return res.status(404).json({ error: 'battle_not_found' })

    // A battle with no arc_battle_id has no on-chain counterpart, so an
    // on-chain bet cannot legitimately belong to it. The old code only compared
    // when arc_battle_id was non-null, which meant an unmapped battle skipped
    // validation entirely - a bet on one battle could be recorded against
    // another. Unmapped now means rejected.
    if (battle.arc_battle_id == null) {
      return res.status(400).json({ error: 'battle_not_on_arc' })
    }
    if (BigInt(battle.arc_battle_id) !== battleId) {
      return res.status(400).json({ error: 'battle_id_mismatch' })
    }

    // 4. Record, using only chain-derived values.
    const { data, error } = await supabase.rpc('record_arc_ticket', {
      p_battle_id: battle_id,
      p_wallet: player,
      p_side: Number(side),
      p_stake: Number(stake) / 10 ** USDC_DECIMALS,
      p_odds: Number(odds) / ODDS_DECIMALS,
      p_tx_hash: tx_hash,
    })

    if (error) {
      const key = Object.keys(ERROR_STATUS).find((k) => String(error.message).includes(k))
      if (key) return res.status(ERROR_STATUS[key]).json({ error: key })
      console.error('record_arc_ticket error:', error.message)
      return res.status(500).json({ error: 'record_failed' })
    }

    await stampShareCode(supabase, tx_hash, code)
    return res.status(200).json(data)
  } catch (err) {
    console.error('place-bet-arc error:', err.message)
    return res.status(500).json({ error: 'arc_bet_failed' })
  }
}
