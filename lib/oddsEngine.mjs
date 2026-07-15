// PredArena Odds Engine — SERVER (authoritative)
//
// Ported from src/services/oddsEngine.ts. Two deliberate differences:
//   1. This is now the SOURCE OF TRUTH for what a bet costs. The client keeps
//      its copy for display only; the server prices every bet and the client's
//      quote is checked against this, not stored.
//   2. All I/O is stripped out. This module is pure math. The caller supplies
//      momentum, live prices, and pools. Deterministic, testable, no network
//      call on the bet path.
//
// getGuaranteedOdds was DELETED — it was dead code and inverted (a "floor"
// built with Math.min that capped payouts BELOW the quoted price). Under fixed
// odds the odds you are quoted are the odds you are paid.

export const HOUSE_MARGIN = 1.30
export const MIN_ODDS = 1.10
export const MAX_SINGLE_ODDS = 30.0
export const MAX_COMBO_ODDS = 100.0
export const BETTING_LOCK_AT = 0.80

export const VOLATILITY = {
  BTC: 3, ETH: 4, BNB: 4, XRP: 5,
  SOL: 5, AVAX: 6, LINK: 5, UNI: 6,
  DOGE: 7, JUP: 7, WIF: 8, BONK: 9, PEPE: 9,
}
export const MOMENTUM_BIAS = {
  BTC: 0.5, ETH: 0.3, BNB: 0.2, XRP: 0.1,
  SOL: 0.0, AVAX: 0.0, LINK: 0.0, UNI: -0.1,
  DOGE: -0.2, JUP: -0.2, WIF: -0.4, BONK: -0.5, PEPE: -0.5,
}

function round2(n) { return Math.round(n * 100) / 100 }

export function applyMargin(probA, probB, probDraw) {
  const total = probA + probB + probDraw
  const nA = probA / total, nB = probB / total, nD = probDraw / total
  const price = (p) => Math.min(MAX_SINGLE_ODDS, Math.max(MIN_ODDS, round2(1 / (p * HOUSE_MARGIN))))
  const oddsA = price(nA), oddsB = price(nB), oddsDraw = price(nD)
  return {
    oddsA, oddsB, oddsDraw,
    probA: nA, probB: nB, probDraw: nD,
    favourite: nA > nB + 0.05 ? 'A' : nB > nA + 0.05 ? 'B' : 'even',
    marginApplied: ((1 / oddsA + 1 / oddsB + 1 / oddsDraw) - 1) * 100,
  }
}

export function getImbalanceAdjustment(sideAPool, sideBPool, totalPool) {
  if (totalPool < 50) return 0
  if (sideAPool <= 0 || sideBPool <= 0) return 0
  const shareA = sideAPool / (sideAPool + sideBPool)
  if (shareA > 0.60) return Math.min(0.15, (shareA - 0.60) * 0.8)
  if (shareA < 0.40) return Math.max(-0.15, (shareA - 0.40) * 0.8)
  return 0
}

// Pure. Caller passes 24h momentum. Result is stored on the battle at creation.
export function getStartingProbs(coinA, coinB, changeA, changeB) {
  const volA = VOLATILITY[coinA] || 5, volB = VOLATILITY[coinB] || 5
  const avgVol = (volA + volB) / 2
  const volDampening = Math.max(0.35, 1 - (avgVol - 3) / 10)
  const diff = changeA - changeB
  const edge = Math.tanh(diff / 8)
  const volEdge = (volB - volA) / 20
  const volSpread = Math.abs(volA - volB) / 10
  const totalEdge = (edge * 0.20 + volEdge + volSpread * Math.sign(edge) * 0.10) * volDampening
  const probA = Math.max(0.10, Math.min(0.80, 0.40 + totalEdge))
  const probB = Math.max(0.10, Math.min(0.80, 0.40 - totalEdge))
  const probDraw = Math.max(0.05, 0.20 - Math.abs(totalEdge) * 0.08)
  const t = probA + probB + probDraw
  return { probA: probA / t, probB: probB / t, probDraw: probDraw / t }
}

function compressOdds(odds, timeProgress, isLeader) {
  if (!isLeader) return odds
  const t = Math.min(1, timeProgress / BETTING_LOCK_AT)
  const certainty = t * t
  return Math.max(1.01, round2(odds - (odds - 1.01) * certainty))
}

export function getInPlayOdds({
  currentPriceA, currentPriceB, startPriceA, startPriceB,
  startTimeMs, endTimeMs, nowMs, baseProbs,
  sideAPool = 0, sideBPool = 0, drawPool = 0,
}) {
  const now = nowMs ?? Date.now()
  const timeProgress = Math.min(1, Math.max(0, (now - startTimeMs) / (endTimeMs - startTimeMs)))
  const confidence = timeProgress * 0.75
  const perfA = startPriceA > 0 ? (currentPriceA - startPriceA) / startPriceA : 0
  const perfB = startPriceB > 0 ? (currentPriceB - startPriceB) / startPriceB : 0
  const perfDiff = perfA - perfB
  const sensitivity = 1 + timeProgress * 2
  const rawShift = Math.tanh(perfDiff * sensitivity * 100) * confidence * 0.50
  const shift = Math.max(-0.30, Math.min(0.30, rawShift))
  const totalPool = sideAPool + sideBPool + drawPool
  const imbalance = getImbalanceAdjustment(sideAPool, sideBPool, totalPool)
  const probA = Math.max(0.05, Math.min(0.90, baseProbs.probA + shift + imbalance))
  const probB = Math.max(0.05, Math.min(0.90, baseProbs.probB - shift - imbalance))
  const probDraw = Math.max(0.02, baseProbs.probDraw - Math.abs(shift) * 0.5)
  const raw = applyMargin(probA, probB, probDraw)
  const aLeading = perfA > perfB, bLeading = perfB > perfA
  const tooClose = Math.abs(perfDiff) < 0.0005
  const finalOddsA = tooClose ? raw.oddsA : compressOdds(raw.oddsA, timeProgress, aLeading)
  const finalOddsB = tooClose ? raw.oddsB : compressOdds(raw.oddsB, timeProgress, bLeading)
  const leaderGap = Math.abs(perfDiff) * 100
  let finalOddsDraw
  if (tooClose) {
    finalOddsDraw = Math.max(2.0, raw.oddsDraw * (1 - timeProgress * 0.3))
  } else {
    const inflationFactor = Math.min(2.50, 1 + timeProgress * leaderGap * 1.5)
    finalOddsDraw = Math.min(MAX_SINGLE_ODDS, round2(raw.oddsDraw * inflationFactor))
  }
  return {
    oddsA: finalOddsA, oddsB: finalOddsB, oddsDraw: round2(finalOddsDraw),
    probA: raw.probA, probB: raw.probB, probDraw: raw.probDraw,
    favourite: raw.favourite, marginApplied: raw.marginApplied,
  }
}

// side: 1 = A, 2 = B, 3 = draw
export function priceLeg(battle, livePrices, nowMs) {
  const baseProbs = {
    probA: Number(battle.base_prob_a),
    probB: Number(battle.base_prob_b),
    probDraw: Number(battle.base_prob_draw),
  }
  const o = getInPlayOdds({
    currentPriceA: livePrices[battle.coin_a],
    currentPriceB: livePrices[battle.coin_b],
    startPriceA: Number(battle.start_price_a),
    startPriceB: Number(battle.start_price_b),
    startTimeMs: new Date(battle.start_time).getTime(),
    endTimeMs: new Date(battle.end_time).getTime(),
    nowMs,
    baseProbs,
    sideAPool: Number(battle.side_a_pool) || 0,
    sideBPool: Number(battle.side_b_pool) || 0,
    drawPool: Number(battle.draw_pool) || 0,
  })
  return { 1: o.oddsA, 2: o.oddsB, 3: o.oddsDraw }
}
