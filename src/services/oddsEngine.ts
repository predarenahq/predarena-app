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

// Fetch 24h price change from CoinGecko (cached)
async function get24hMomentum(coin: string): Promise<number> {
  const cached = momentumCache[coin]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.change24h
  }

  const geckoId = COINGECKO_IDS[coin]
  if (!geckoId) return 0

  try {
    // Use our proxy to avoid CORS
    const ticker = Object.keys(COINGECKO_IDS).find(k => COINGECKO_IDS[k] === geckoId) || coin
    const res = await fetch(`/api/momentum?coins=${ticker}`)
    const data = await res.json()
    const change24h = data?.[ticker]?.change24h || 0
    momentumCache[coin] = { change24h, fetchedAt: Date.now() }
    return change24h
  } catch {
    return 0
  }
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
  // A 10% diff gives ~0.76 edge, 5% diff gives ~0.46 edge
  const edge = Math.tanh(diff / 10)

  // Base probs — favourite gets up to 15% edge boost
  const probA = Math.max(0.10, Math.min(0.80, 0.40 + edge * 0.15))
  const probB = Math.max(0.10, Math.min(0.80, 0.40 - edge * 0.15))
  const probDraw = Math.max(0.05, 0.20 - Math.abs(edge) * 0.05)

  return applyMargin(probA, probB, probDraw)
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
  baseOdds: OddsResult // starting odds as anchor
): OddsResult {
  const now = Date.now()
  const totalDuration = endTimeMs - startTimeMs
  const elapsed = Math.max(0, now - startTimeMs)

  // Time progress 0 → 1
  const timeProgress = Math.min(1, elapsed / totalDuration)

  // How confident are we in the current result?
  // Starts at 0 (battle just began) → 0.85 (near the end)
  const confidence = timeProgress * 0.85

  // Current performance delta
  const perfA = startPriceA > 0 ? (currentPriceA - startPriceA) / startPriceA : 0
  const perfB = startPriceB > 0 ? (currentPriceB - startPriceB) / startPriceB : 0
  const perfDiff = perfA - perfB

  // Normalise perf diff — small moves matter more as time runs out
  const sensitivity = 1 + timeProgress * 3 // increases 4x by end
  const shift = Math.tanh(perfDiff * sensitivity * 100) * confidence * 0.45

  // Start from base probabilities, then shift based on who's winning
  const probA = Math.max(0.05, Math.min(0.92, baseOdds.probA + shift))
  const probB = Math.max(0.05, Math.min(0.92, baseOdds.probB - shift))

  // Draw becomes less likely as one coin pulls ahead
  const drawReduction = Math.abs(shift) * 0.5
  const probDraw = Math.max(0.02, baseOdds.probDraw - drawReduction)

  return applyMargin(probA, probB, probDraw)
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

  return applyMargin(
    Math.max(0.05, probA),
    Math.max(0.05, probB),
    Math.max(0.02, probDraw)
  )
}
