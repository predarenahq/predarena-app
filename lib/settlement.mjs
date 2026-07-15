// PredArena settlement — FIXED ODDS.
//
// Replaces the old parimutuel/hybrid settleBattles + settleComboTickets.
// Drop-in for api/cron.mjs: import these and call settleBattles(deps) from the
// handler. `deps` injects the things cron already has, so this module stays
// pure of its own Supabase client / price fetch and is unit-testable.
//
//   import { settleBattles } from './lib/settlement.mjs'
//   const failures = await settleBattles({ supabase, getPythPrices })
//
// Model:
//   * A winner is paid stake * odds. Full stop. No pot, no fee, no parimutuel.
//   * Losers' stakes stay in the vault — that retained money IS the house edge.
//   * A combo pays stake * combo_odds only if every leg wins; else it forfeits.
//   * A voided battle refunds every stake on it.
//   * platform_treasury is a running house-PnL ledger; it may go negative and
//     that is surfaced, never clamped.
//
// Crash-safety: finalizeBattles() only flips battle status + winner (the CAS
// claim). settlePendingSingles()/settleComboTickets() pay based on that status,
// driven entirely by the per-ticket `claimed` flag. A crash between the two
// phases self-heals on the next run.

const MAX_SINGLE_ODDS = 30.0
const MAX_COMBO_ODDS = 100.0
const LAMPORTS = 1_000_000_000
const DRAW_THRESHOLD = 0 // exact tie only; any measurable move picks a winner

const usdToLamports = (usd, solPrice) => Math.floor((usd / solPrice) * LAMPORTS)

// TWAP anchored to the battle's END, not to now(). Averages price_history in
// [end-90s, end]; falls back to a single live price only if the window is thin.
async function finalPrice(supabase, getPythPrices, coin, endTimeMs) {
  const from = new Date(endTimeMs - 90 * 1000).toISOString()
  const to = new Date(endTimeMs).toISOString()
  const { data } = await supabase
    .from('price_history').select('price')
    .eq('coin', coin).gte('recorded_at', from).lte('recorded_at', to)
    .order('recorded_at', { ascending: false }).limit(10)

  if (data && data.length >= 2) {
    return data.reduce((s, r) => s + Number(r.price), 0) / data.length
  }
  const live = await getPythPrices([coin])
  return live[coin] ?? null
}

// PHASE 1: decide outcomes. CAS-claims each live/ended battle to settled|void.
async function finalizeBattles({ supabase, getPythPrices }) {
  const now = new Date().toISOString()
  const { data: battles } = await supabase
    .from('battles').select('*').eq('status', 'live').lte('end_time', now)
  if (!battles?.length) return

  for (const b of battles) {
    try {
      const endMs = new Date(b.end_time).getTime()
      const [fa, fb] = await Promise.all([
        finalPrice(supabase, getPythPrices, b.coin_a, endMs),
        finalPrice(supabase, getPythPrices, b.coin_b, endMs),
      ])
      if (fa == null || fb == null || !b.start_price_a || !b.start_price_b) {
        console.error(`finalize: missing prices for ${b.coin_a}/${b.coin_b} — leaving live`)
        continue
      }
      const changeA = (fa - b.start_price_a) / b.start_price_a
      const changeB = (fb - b.start_price_b) / b.start_price_b
      let winner
      if (Math.abs(changeA - changeB) <= DRAW_THRESHOLD) winner = 3
      else if (changeA > changeB) winner = 1
      else winner = 2

      // CAS claim: only the worker that flips live->settled proceeds. A second
      // concurrent worker gets zero rows and skips. This is the whole defence
      // against double-settlement.
      const { data: claimed } = await supabase
        .from('battles')
        .update({ status: 'settled', winner, final_price_a: fa, final_price_b: fb })
        .eq('id', b.id).eq('status', 'live')
        .select('id')
      if (!claimed?.length) {
        console.log(`finalize: battle ${b.id} already claimed by another worker`)
      }
    } catch (err) {
      console.error(`finalize failed for battle ${b.id}:`, err.message)
    }
  }
}

// PHASE 2a: pay/forfeit/refund all unclaimed SINGLE tickets whose battle is done.
async function settlePendingSingles({ supabase, getPythPrices }, solPrice) {
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*, battles(status, winner)')
    .is('combo_id', null).eq('claimed', false)
  if (!tickets?.length) return { failures: [], stakesIn: 0, payoutsOut: 0 }

  const failures = []
  let stakesIn = 0, payoutsOut = 0

  for (const t of tickets) {
    const st = t.battles?.status
    if (st !== 'settled' && st !== 'void') continue // battle not finished yet

    try {
      if (st === 'void') {
        // Refund the stake.
        const refund = usdToLamports(Number(t.stake), solPrice)
        const { error } = await supabase.rpc('credit_balance', { p_wallet: t.wallet_address, p_lamports: refund })
        if (error) { failures.push({ ticket: t.id, wallet: t.wallet_address, reason: error.message }); continue }
        await supabase.from('tickets').update({ claimed: true }).eq('id', t.id)
        continue
      }

      // settled
      stakesIn += Number(t.stake)
      const won = t.side === t.battles.winner
      if (won) {
        const odds = Math.min(Number(t.odds), MAX_SINGLE_ODDS)
        const payoutUsd = Number(t.stake) * odds
        const payoutLamports = usdToLamports(payoutUsd, solPrice)
        const { error } = await supabase.rpc('credit_balance', { p_wallet: t.wallet_address, p_lamports: payoutLamports })
        if (error) { failures.push({ ticket: t.id, wallet: t.wallet_address, usd: payoutUsd, reason: error.message }); continue }
        payoutsOut += payoutUsd
        await supabase.from('tickets').update({ claimed: true }).eq('id', t.id)
      } else {
        // Loser: stake stays in the vault. Just close the ticket.
        await supabase.from('tickets').update({ claimed: true }).eq('id', t.id)
      }
    } catch (err) {
      failures.push({ ticket: t.id, wallet: t.wallet_address, reason: err.message })
    }
  }
  return { failures, stakesIn, payoutsOut }
}

// PHASE 2b: settle combos. One stake, one payout at (capped) combo odds.
async function settleComboTickets({ supabase }, solPrice) {
  const { data: legs } = await supabase
    .from('tickets').select('*, battles(status, winner)')
    .not('combo_id', 'is', null).eq('claimed', false)
  if (!legs?.length) return { failures: [], stakesIn: 0, payoutsOut: 0 }

  const groups = {}
  for (const l of legs) (groups[l.combo_id] ??= []).push(l)

  const failures = []
  let stakesIn = 0, payoutsOut = 0

  for (const [comboId, ls] of Object.entries(groups)) {
    try {
      const anyVoid = ls.some((t) => t.battles?.status === 'void')
      const allDone = ls.every((t) => t.battles?.status === 'settled' || t.battles?.status === 'void')
      if (!allDone) continue // at least one leg's battle still live

      const wallet = ls[0].wallet_address
      const stake = Number(ls[0].stake) // single stake covers all legs
      const comboOdds = Math.min(Number(ls[0].combo_odds), MAX_COMBO_ODDS)
      const mark = async () => { for (const l of ls) await supabase.from('tickets').update({ claimed: true }).eq('id', l.id) }

      if (anyVoid) {
        // A voided leg voids the combo: refund the single stake.
        const { error } = await supabase.rpc('credit_balance', { p_wallet: wallet, p_lamports: usdToLamports(stake, solPrice) })
        if (error) { failures.push({ combo: comboId, wallet, reason: error.message }); continue }
        await mark()
        continue
      }

      stakesIn += stake
      const allWon = ls.every((t) => t.battles?.winner === t.side)
      if (allWon) {
        const payoutUsd = stake * comboOdds
        const { error } = await supabase.rpc('credit_balance', { p_wallet: wallet, p_lamports: usdToLamports(payoutUsd, solPrice) })
        if (error) { failures.push({ combo: comboId, wallet, usd: payoutUsd, reason: error.message }); continue }
        payoutsOut += payoutUsd
        await mark()
      } else {
        // Any leg lost -> whole combo forfeits. Stake stays in the vault.
        await mark()
      }
    } catch (err) {
      failures.push({ combo: comboId, reason: err.message })
    }
  }
  return { failures, stakesIn, payoutsOut }
}

export async function settleBattles(deps) {
  const { supabase, getPythPrices } = deps

  await finalizeBattles(deps)

  const solPrices = await getPythPrices(['SOL'])
  const solPrice = solPrices['SOL']
  if (!(solPrice > 0)) {
    // No SOL price = we cannot convert USD payouts to lamports. Refuse to pay
    // on a guessed price (the old code used $100). Next run retries.
    throw new Error('sol_price_unavailable')
  }

  const singles = await settlePendingSingles(deps, solPrice)
  const combos = await settleComboTickets(deps, solPrice)

  const stakesIn = singles.stakesIn + combos.stakesIn
  const payoutsOut = singles.payoutsOut + combos.payoutsOut
  const failures = [...singles.failures, ...combos.failures]

  // House PnL ledger, in lamports to match the vault + balances. stakesIn /
  // payoutsOut are USD here; convert at the settlement SOL price before the
  // delta. Balance may go negative — surfaced, never clamped.
  if (stakesIn > 0 || payoutsOut > 0) {
    const { data: bal, error } = await supabase.rpc('apply_treasury_delta', {
      p_stakes_in: usdToLamports(stakesIn, solPrice),
      p_payouts_out: usdToLamports(payoutsOut, solPrice),
    })
    if (error) console.error('treasury update failed:', error.message)
    else if (Number(bal) < 0) console.error(`⚠️ TREASURY NEGATIVE: ${(Number(bal)/1e9).toFixed(4)} SOL — house is underwater`)
  }

  return failures
}

export { finalizeBattles, settlePendingSingles, settleComboTickets }
