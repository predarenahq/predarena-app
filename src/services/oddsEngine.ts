// PredArena Odds Engine
// Seeded from 24h momentum, updated in real-time from Pyth, 5% house margin baked in

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  BNB: 'binancecoin',
  DOGE: 'dogecoin',
  PEPE: 'pepe',
  LINK: 'chainlink',
  UNI: 'uniswap',
  JUP: 'jupiter-exchange-solana',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  XRP: 'ripple',
}

const HOUSE_MARGIN = 1.05 // 5% overround

// Historical volatility profiles — higher = more volatile = more unpredictable
// Scale 1-10: BTC=3 (stable), PEPE=9 (wild)
const VOLATILITY: Record<string, number> = {
  BTC: 3, ETH: 4, BNB: 4, XRP: 5,
  SOL: 5, AVAX: 6, LINK: 5, UNI: 6,
  DOGE: 7, JUP: 7, WIF: 8, BONK: 9, PEPE: 9,
}

function getVolatilitySpread(coinA: string, coinB: string): number {
  const volA = VOLATILITY[coinA] || 5
  const volB = VOLATILITY[coinB] || 5
  // Higher volatility difference = more spread in starting odds
  return Math.abs(volA - volB) / 10
}
const MIN_ODDS = 1.10
const MAX_ODDS = 50.00

// Cache CoinGecko data to avoid hitting rate limits
const momentumCache: Record<string, { change24h: number; fetchedAt: number }> = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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

// Hardcoded momentum bias — used as Layer 3 fallback
// Reflects general market cap / stability relative ranking
const MOMENTUM_BIAS: Record<string, number> = {
  BTC: 0.5, ETH: 0.3, BNB: 0.2, XRP: 0.1,
  SOL: 0.0, AVAX: 0.0, LINK: 0.0, UNI: -0.1,
  DOGE: -0.2, JUP: -0.2, WIF: -0.4, BONK: -0.5, PEPE: -0.5,
}

// Layer 2 fallback: calculate 24h change from our own price_history table
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
  } catch {
    return null
  }
}

// Fetch 24h price change — 3 layer fallback
async function get24hMomentum(coin: string): Promise<number> {
  const cached = momentumCache[coin]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.change24h
  }

  const geckoId = COINGECKO_IDS[coin]
  if (!geckoId) return MOMENTUM_BIAS[coin] || 0

  // Layer 1: CoinGecko via our proxy
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

  // Layer 2: Our own price_history table
  console.warn(`CoinGecko failed for ${coin}, trying price_history`)
  const historyChange = await get24hMomentumFromHistory(coin)
  if (historyChange !== null) {
    momentumCache[coin] = { change24h: historyChange, fetchedAt: Date.now() }
    return historyChange
  }

  // Layer 3: Hardcoded bias fallback
  console.warn(`price_history failed for ${coin}, using hardcoded bias`)
  const bias = MOMENTUM_BIAS[coin] || 0
  momentumCache[coin] = { change24h: bias, fetchedAt: Date.now() }
  return bias
}

// Apply house margin to raw probabilities
function applyMargin(probA: number, probB: number, probDraw: number): OddsResult {
  // Normalise first
  const total = probA + probB + probDraw
  const nA = probA / total
  const nB = probB / total
  const nD = probDraw / total

  // Scale up by house margin
  const scale = HOUSE_MARGIN

  const oddsA = Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round((1 / (nA * scale)) * 100) / 100))
  const oddsB = Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round((1 / (nB * scale)) * 100) / 100))
  const oddsDraw = Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round((1 / (nD * scale)) * 100) / 100))

  return {
    oddsA,
    oddsB,
    oddsDraw,
    probA: nA,
    probB: nB,
    probDraw: nD,
    favourite: nA > nB + 0.05 ? 'A' : nB > nA + 0.05 ? 'B' : 'even',
    marginApplied: ((1 / oddsA + 1 / oddsB + 1 / oddsDraw) - 1) * 100,
  }
}

// STARTING ODDS — seeded from 24h momentum before battle begins
export async function getStartingOdds(coinA: string, coinB: string): Promise<OddsResult> {
  const [changeA, changeB] = await Promise.all([
    get24hMomentum(coinA),
    get24hMomentum(coinB),
  ])

  // Momentum difference — how much one coin is outperforming the other today
  const diff = changeA - changeB

  // Convert diff to an edge using tanh (caps at ±1)
  const edge = Math.tanh(diff / 8)

  // Volatility spread — more volatile coin pair = more spread in odds
  const volSpread = getVolatilitySpread(coinA, coinB)
  const volA = VOLATILITY[coinA] || 5
  const volB = VOLATILITY[coinB] || 5

  // Higher volatility coin has more uncertain outcome (wider odds spread)
  // Lower volatility coin is more predictable
  const volEdge = (volB - volA) / 20 // positive if A is more stable

  // Combined edge: momentum + volatility
  const totalEdge = edge * 0.20 + volEdge + volSpread * Math.sign(edge) * 0.10

  // Base probs — favourite gets up to 25% edge boost
  const probA = Math.max(0.08, Math.min(0.85, 0.40 + totalEdge))
  const probB = Math.max(0.08, Math.min(0.85, 0.40 - totalEdge))
  const probDraw = Math.max(0.04, 0.20 - Math.abs(totalEdge) * 0.08)

  return applyMargin(probA, probB, probDraw)
}

// Time-based odds compression
// At battle start: full odds (e.g. 2.41x)
// As time runs out: odds compress toward 1.01x for the leader
// Late bettors get punished — discourages last-second gaming
function compressOdds(odds: number, timeProgress: number, isLeader: boolean): number {
  if (!isLeader) return odds // loser odds can stay high or go higher

  // Leader odds compress from starting odds → 1.01x over time
  // Compression accelerates in the last 20% of battle
  const compressionRate = timeProgress < 0.8
    ? timeProgress * 0.5          // gentle compression early
    : 0.4 + (timeProgress - 0.8) * 3.0  // aggressive in final stretch

  const compressed = odds - (odds - 1.01) * compressionRate
  return Math.max(1.01, Math.round(compressed * 100) / 100)
}

// IN-PLAY ODDS — updated in real time as battle progresses
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
  const totalDuration = endTimeMs - startTimeMs
  const elapsed = Math.max(0, now - startTimeMs)

  // Time progress 0 → 1
  const timeProgress = Math.min(1, elapsed / totalDuration)

  // Confidence in current result increases with time
  const confidence = timeProgress * 0.85

  // Current performance delta
  const perfA = startPriceA > 0 ? (currentPriceA - startPriceA) / startPriceA : 0
  const perfB = startPriceB > 0 ? (currentPriceB - startPriceB) / startPriceB : 0
  const perfDiff = perfA - perfB

  // Sensitivity increases as time runs out
  const sensitivity = 1 + timeProgress * 4
  const shift = Math.tanh(perfDiff * sensitivity * 100) * confidence * 0.50

  // Raw probabilities
  const probA = Math.max(0.05, Math.min(0.95, baseOdds.probA + shift))
  const probB = Math.max(0.05, Math.min(0.95, baseOdds.probB - shift))
  const probDraw = Math.max(0.01, baseOdds.probDraw - Math.abs(shift) * 0.6)

  // Get raw odds from margin
  const raw = applyMargin(probA, probB, probDraw)

  // Determine who is currently leading
  const aLeading = perfA > perfB
  const bLeading = perfB > perfA
  const tooClose = Math.abs(perfDiff) < 0.0005 // within 0.05% — too close to call

  // Apply time compression to leader
  const finalOddsA = tooClose
    ? raw.oddsA
    : compressOdds(raw.oddsA, timeProgress, aLeading)

  const finalOddsB = tooClose
    ? raw.oddsB
    : compressOdds(raw.oddsB, timeProgress, bLeading)

  // Draw odds INCREASE as time runs out and a leader emerges
  // A draw becomes less and less likely the further apart the two coins are
  // Only compress draw odds if it's genuinely neck and neck
  const leaderGap = Math.abs(perfDiff) * 100 // in percentage points
  let finalOddsDraw: number
  if (tooClose) {
    // Genuinely tied — draw stays moderate, slight compression
    finalOddsDraw = Math.max(2.00, raw.oddsDraw * (1 - timeProgress * 0.3))
  } else {
    // One coin is clearly ahead — draw becomes very unlikely → higher odds
    const drawInflation = 1 + timeProgress * leaderGap * 2
    finalOddsDraw = Math.min(MAX_ODDS, Math.round(raw.oddsDraw * drawInflation * 100) / 100)
  }

  return {
    oddsA: finalOddsA,
    oddsB: finalOddsB,
    oddsDraw: Math.round(finalOddsDraw * 100) / 100,
    probA: raw.probA,
    probB: raw.probB,
    probDraw: raw.probDraw,
    favourite: raw.favourite,
    marginApplied: raw.marginApplied,
  }
}

// Calculate minimum guaranteed payout for option 3 hybrid model
export function getGuaranteedOdds(
  currentOdds: number,
  timeProgress: number
): number {
  // Guaranteed floor starts at 1.50x at battle start
  // Compresses to 1.01x as battle ends
  // This is what platform reserves cover if pool is too thin
  const floor = Math.max(1.01, 1.50 - timeProgress * 0.49)
  return Math.min(currentOdds, Math.round(floor * 100) / 100)
}

// Fix 1: Bet imbalance adjustment
// If too much money is on one side, shift odds to attract balancing bets
// This is independent of in-play price movement
export function getImbalanceAdjustment(
  sideAPool: number,
  sideBPool: number,
  totalPool: number
): number {
  if (totalPool < 50) return 0 // need meaningful pool before adjusting
  if (sideAPool <= 0 || sideBPool <= 0) return 0 // one side empty, no adjustment
  const shareA = sideAPool / (sideAPool + sideBPool) // exclude draw from imbalance calc
  // Threshold: >60% on one side triggers adjustment — max 0.15 shift
  if (shareA > 0.60) return Math.min(0.15, (shareA - 0.60) * 0.8)
  if (shareA < 0.40) return Math.max(-0.15, (shareA - 0.40) * 0.8)
  return 0
}

// Simple odds from pool (parimutuel fallback when no prices available)
export function getPoolOdds(
  sideAPool: number,
  sideBPool: number,
  drawPool: number,
  totalPool: number
): OddsResult {
  if (totalPool === 0) {
    return applyMargin(0.40, 0.40, 0.20)
  }

  const probA = sideAPool / totalPool
  const probB = sideBPool / totalPool
  const probDraw = drawPool / totalPool

  // Apply imbalance adjustment
  const imbalance = getImbalanceAdjustment(sideAPool, sideBPool, totalPool)
  
  return applyMargin(
    Math.max(0.05, probA + imbalance),
    Math.max(0.05, probB - imbalance),
    Math.max(0.02, probDraw)
  )
}
