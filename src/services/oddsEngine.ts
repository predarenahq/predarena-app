// PredArena Odds Engine v2
// Fixes: sensitivity dampened, imbalance applied in-play, high-vol pairs pushed toward 50/50

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', AVAX: 'avalanche-2',
  BNB: 'binancecoin', DOGE: 'dogecoin', PEPE: 'pepe', LINK: 'chainlink',
  UNI: 'uniswap', JUP: 'jupiter-exchange-solana', WIF: 'dogwifcoin',
  BONK: 'bonk', XRP: 'ripple',
}

const HOUSE_MARGIN = 1.30  // 30% overround — heavy SportyBet-style house edge
const MIN_ODDS = 1.10
const MAX_ODDS = 30.00

// Volatility scale 1-10. Higher = more unpredictable
const VOLATILITY: Record<string, number> = {
  BTC: 3, ETH: 4, BNB: 4, XRP: 5,
  SOL: 5, AVAX: 6, LINK: 5, UNI: 6,
  DOGE: 7, JUP: 7, WIF: 8, BONK: 9, PEPE: 9,
}

const MOMENTUM_BIAS: Record<string, number> = {
  BTC: 0.5, ETH: 0.3, BNB: 0.2, XRP: 0.1,
  SOL: 0.0, AVAX: 0.0, LINK: 0.0, UNI: -0.1,
  DOGE: -0.2, JUP: -0.2, WIF: -0.4, BONK: -0.5, PEPE: -0.5,
}

const momentumCache: Record<string, { change24h: number; fetchedAt: number }> = {}
const CACHE_TTL = 5 * 60 * 1000

export interface OddsResult {
  oddsA: number
  oddsB: number
  oddsDraw: number
  probA: number
  probB: number
  probDraw: number
  favourite: 'A' | 'B' | 'even'
  marginApplied: number
}

async function get24hMomentumFromHistory(coin: string): Promise<number | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.REACT_APP_SUPABASE_URL!,
      process.env.REACT_APP_SUPABASE_ANON_KEY!
    )
    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [{ data: latest }, { data: old24h }] = await Promise.all([
      sb.from('price_history').select('price').eq('coin', coin).order('recorded_at', { ascending: false }).limit(1).single(),
      sb.from('price_history').select('price').eq('coin', coin).gte('recorded_at', ago24h).order('recorded_at', { ascending: true }).limit(1).single(),
    ])
    if (latest?.price && old24h?.price) {
      return ((latest.price - old24h.price) / old24h.price) * 100
    }
    return null
  } catch { return null }
}

async function get24hMomentum(coin: string): Promise<number> {
  const cached = momentumCache[coin]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.change24h

  const geckoId = COINGECKO_IDS[coin]
  if (!geckoId) return MOMENTUM_BIAS[coin] || 0

  try {
    const ticker = Object.keys(COINGECKO_IDS).find(k => COINGECKO_IDS[k] === geckoId) || coin
    const res = await fetch(`/api/momentum?coins=${ticker}`)
    if (res.ok) {
      const data = await res.json()
      const change24h = data?.[ticker]?.change24h
      if (typeof change24h === 'number') {
        momentumCache[coin] = { change24h, fetchedAt: Date.now() }
        return change24h
      }
    }
  } catch {}

  const historyChange = await get24hMomentumFromHistory(coin)
  if (historyChange !== null) {
    momentumCache[coin] = { change24h: historyChange, fetchedAt: Date.now() }
    return historyChange
  }

  const bias = MOMENTUM_BIAS[coin] || 0
  momentumCache[coin] = { change24h: bias, fetchedAt: Date.now() }
  return bias
}

function applyMargin(probA: number, probB: number, probDraw: number): OddsResult {
  const total = probA + probB + probDraw
  const nA = probA / total
  const nB = probB / total
  const nD = probDraw / total

  const oddsA    = Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round((1 / (nA * HOUSE_MARGIN)) * 100) / 100))
  const oddsB    = Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round((1 / (nB * HOUSE_MARGIN)) * 100) / 100))
  const oddsDraw = Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round((1 / (nD * HOUSE_MARGIN)) * 100) / 100))

  return {
    oddsA, oddsB, oddsDraw,
    probA: nA, probB: nB, probDraw: nD,
    favourite: nA > nB + 0.05 ? 'A' : nB > nA + 0.05 ? 'B' : 'even',
    marginApplied: ((1 / oddsA + 1 / oddsB + 1 / oddsDraw) - 1) * 100,
  }
}

// STARTING ODDS
// Fix: high-volatility pairs are dampened toward 50/50
// e.g. DOGE vs PEPE should be much closer to evens than BTC vs ETH
export async function getStartingOdds(coinA: string, coinB: string): Promise<OddsResult> {
  const [changeA, changeB] = await Promise.all([
    get24hMomentum(coinA),
    get24hMomentum(coinB),
  ])

  const volA = VOLATILITY[coinA] || 5
  const volB = VOLATILITY[coinB] || 5
  const avgVol = (volA + volB) / 2

  // Dampen edge for high-volatility pairs — neither coin is reliably predictable
  // BTC/ETH (avg vol 3.5) → dampening 0.97 (almost none)
  // DOGE/PEPE (avg vol 8)  → dampening 0.50 (half the edge)
  const volDampening = Math.max(0.35, 1 - (avgVol - 3) / 10)

  const diff = changeA - changeB
  const edge = Math.tanh(diff / 8)
  const volEdge = (volB - volA) / 20
  const volSpread = Math.abs(volA - volB) / 10

  const totalEdge = (edge * 0.20 + volEdge + volSpread * Math.sign(edge) * 0.10) * volDampening

  const probA    = Math.max(0.10, Math.min(0.80, 0.40 + totalEdge))
  const probB    = Math.max(0.10, Math.min(0.80, 0.40 - totalEdge))
  const probDraw = Math.max(0.05, 0.20 - Math.abs(totalEdge) * 0.08)

  return applyMargin(probA, probB, probDraw)
}

// Time-based leader odds compression
// Fix: softer late-game compression — was too aggressive, punished late bettors too hard
const BETTING_LOCK_AT = 0.80  // betting closes here — odds must bottom out by then

function compressOdds(odds: number, timeProgress: number, isLeader: boolean): number {
  if (!isLeader) return odds

  // The leader's odds must reach the 1.01 floor by the time betting LOCKS
  // (80% elapsed), not by the time the battle ends — nobody can bet after the
  // lock, so compression that peaks at t=1.0 never actually reaches the user.
  //
  // We rescale progress against the lock point and use a quadratic ease so the
  // drift is gentle early and collapses hard as the window closes. Time alone
  // drags the leader down: at 80% elapsed the leader pays ~1.01x regardless of
  // how narrow the lead is. That's the liability protection.
  const t = Math.min(1, timeProgress / BETTING_LOCK_AT)
  const certainty = t * t                          // quadratic: slow start, sharp finish

  const compressed = odds - (odds - 1.01) * certainty
  return Math.max(1.01, Math.round(compressed * 100) / 100)
}

// IN-PLAY ODDS
// Fixes:
//   1. sensitivity reduced from 4x to 2x — stops odds snapping to extremes
//   2. shift capped at ±0.30 — prevents total probability collapse
//   3. imbalance adjustment now actually applied to in-play probs
//   4. draw odds inflation capped more reasonably
export function getInPlayOdds(
  coinA: string,
  coinB: string,
  currentPriceA: number,
  currentPriceB: number,
  startPriceA: number,
  startPriceB: number,
  startTimeMs: number,
  endTimeMs: number,
  baseOdds: OddsResult,
  sideAPool: number = 0,
  sideBPool: number = 0,
  drawPool: number = 0
): OddsResult {
  const now = Date.now()
  const timeProgress = Math.min(1, Math.max(0, (now - startTimeMs) / (endTimeMs - startTimeMs)))
  const confidence   = timeProgress * 0.75          // was 0.85 — less overconfident

  const perfA    = startPriceA > 0 ? (currentPriceA - startPriceA) / startPriceA : 0
  const perfB    = startPriceB > 0 ? (currentPriceB - startPriceB) / startPriceB : 0
  const perfDiff = perfA - perfB

  // Fix 1: sensitivity 2x max (was 4x) — much calmer odds movement
  const sensitivity = 1 + timeProgress * 2
  const rawShift    = Math.tanh(perfDiff * sensitivity * 100) * confidence * 0.50

  // Fix 2: hard cap on shift — prevents probs from collapsing entirely
  const shift = Math.max(-0.30, Math.min(0.30, rawShift))

  const totalPool = sideAPool + sideBPool + drawPool

  // Fix 3: apply pool imbalance to in-play probs (was missing entirely)
  const imbalance = getImbalanceAdjustment(sideAPool, sideBPool, totalPool)

  const probA    = Math.max(0.05, Math.min(0.90, baseOdds.probA + shift + imbalance))
  const probB    = Math.max(0.05, Math.min(0.90, baseOdds.probB - shift - imbalance))
  const probDraw = Math.max(0.02, baseOdds.probDraw - Math.abs(shift) * 0.5)

  const raw      = applyMargin(probA, probB, probDraw)
  const aLeading = perfA > perfB
  const bLeading = perfB > perfA
  const tooClose = Math.abs(perfDiff) < 0.0005

  const finalOddsA = tooClose ? raw.oddsA : compressOdds(raw.oddsA, timeProgress, aLeading)
  const finalOddsB = tooClose ? raw.oddsB : compressOdds(raw.oddsB, timeProgress, bLeading)

  // Fix 4: draw inflation capped — prevents draw odds reaching absurd levels
  const leaderGap = Math.abs(perfDiff) * 100
  let finalOddsDraw: number
  if (tooClose) {
    finalOddsDraw = Math.max(2.00, raw.oddsDraw * (1 - timeProgress * 0.3))
  } else {
    const inflationFactor = Math.min(2.50, 1 + timeProgress * leaderGap * 1.5)  // was 2.0 multiplier
    finalOddsDraw = Math.min(MAX_ODDS, Math.round(raw.oddsDraw * inflationFactor * 100) / 100)
  }

  return {
    oddsA: finalOddsA,
    oddsB: finalOddsB,
    oddsDraw: Math.round(finalOddsDraw * 100) / 100,
    probA: raw.probA, probB: raw.probB, probDraw: raw.probDraw,
    favourite: raw.favourite,
    marginApplied: raw.marginApplied,
  }
}

export function getGuaranteedOdds(currentOdds: number, timeProgress: number): number {
  const floor = Math.max(1.01, 1.50 - timeProgress * 0.49)
  return Math.min(currentOdds, Math.round(floor * 100) / 100)
}

export function getImbalanceAdjustment(
  sideAPool: number,
  sideBPool: number,
  totalPool: number
): number {
  if (totalPool < 50) return 0
  if (sideAPool <= 0 || sideBPool <= 0) return 0
  const shareA = sideAPool / (sideAPool + sideBPool)
  if (shareA > 0.60) return Math.min(0.15, (shareA - 0.60) * 0.8)
  if (shareA < 0.40) return Math.max(-0.15, (shareA - 0.40) * 0.8)
  return 0
}

export function getPoolOdds(
  sideAPool: number,
  sideBPool: number,
  drawPool: number,
  totalPool: number
): OddsResult {
  if (totalPool === 0) return applyMargin(0.40, 0.40, 0.20)

  const probA    = sideAPool / totalPool
  const probB    = sideBPool / totalPool
  const probDraw = drawPool / totalPool
  const imbalance = getImbalanceAdjustment(sideAPool, sideBPool, totalPool)

  return applyMargin(
    Math.max(0.05, probA + imbalance),
    Math.max(0.05, probB - imbalance),
    Math.max(0.02, probDraw)
  )
}
