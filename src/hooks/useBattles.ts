import { useEffect, useState, useRef } from 'react'
import { supabase, Battle } from '../lib/supabase'
import { getStartingOdds, getInPlayOdds, OddsResult } from '../services/oddsEngine'
import { getPythPrices } from '../services/pythPrices'

type MatchCategory = "Major" | "Altcoins" | "L1" | "L2" | "DeFi" | "Meme" | "AI"

export type Match = {
  id: string
  category: MatchCategory
  board: 'Live' | 'Upcoming'
  duration: string
  league: string
  title: string
  subtitle: string
  left: { ticker: string; odds: number; change: string }
  draw: { odds: number; change: string }
  right: { ticker: string; odds: number; change: string }
  pool: number
  entries: number
  timer: string
  status: string
  startTime: string
  endTime: string
  startPriceA: number
  startPriceB: number
  bettingLocked: boolean
  progress: number
}

function calculateOdds(sidePool: number, totalPool: number): number {
  if (totalPool === 0 || sidePool === 0) return 2.0
  return Math.round((totalPool / sidePool) * 100) / 100
}

// Cache for starting odds per battle
const oddsCache: Record<string, OddsResult> = {}

function getTimer(battle: Battle): string {
  const now = new Date()
  const end = new Date(battle.end_time)
  const start = new Date(battle.start_time)

  if (battle.status === 'settled') return 'Settled'

  if (battle.status === 'upcoming') {
    const diff = start.getTime() - now.getTime()
    if (diff <= 0) return 'Starting...'
    const mins = Math.floor(diff / 60000)
    return `Starts in ${mins}m`
  }

  const diff = end.getTime() - now.getTime()
  if (diff <= 0) return 'Settling...'

  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)

  if (hours > 0) return `${hours}h ${mins}m left`
  if (mins > 0) return `${mins}m ${secs}s left`
  return `${secs}s left`
}

function battleToMatch(battle: Battle, odds?: OddsResult): Match {
  const total = battle.total_pool || 0
  const oddsA = odds?.oddsA ?? calculateOdds(battle.side_a_pool, total)
  const oddsB = odds?.oddsB ?? calculateOdds(battle.side_b_pool, total)
  const oddsDraw = odds?.oddsDraw ?? calculateOdds(battle.draw_pool, total)

  return {
    id: battle.id,
    category: (battle.league || "Major") as MatchCategory,
    board: battle.status === 'upcoming' ? 'Upcoming' : 'Live',
    duration: battle.duration,
    league: battle.league,
    title: `${battle.coin_a} vs ${battle.coin_b}`,
    subtitle: `Who outperforms over the next ${battle.duration}?`,
    left: { ticker: battle.coin_a, odds: oddsA, change: '' },
    draw: { odds: oddsDraw, change: 'Tie move' },
    right: { ticker: battle.coin_b, odds: oddsB, change: '' },
    pool: total,
    entries: 0,
    timer: getTimer(battle),
    status: battle.status,
    startTime: battle.start_time,
    endTime: battle.end_time,
    startPriceA: battle.start_price_a || 0,
    startPriceB: battle.start_price_b || 0,
    bettingLocked: computeLocked(battle),
    progress: computeProgress(battle),
  }
}

const BETTING_LOCK_THRESHOLD = 0.80  // betting closes at 80% elapsed

function computeProgress(battle: Battle): number {
  const start = new Date(battle.start_time).getTime()
  const end = new Date(battle.end_time).getTime()
  if (end <= start) return 0
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
}

function computeLocked(battle: Battle): boolean {
  if (battle.status !== 'live') return true          // upcoming/settled/cancelled = no betting
  return computeProgress(battle) >= BETTING_LOCK_THRESHOLD
}

export function useBattles() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const rawBattlesRef = useRef<any[]>([])
  const livePricesRef = useRef<Record<string, number>>({})

  // Pure, synchronous: build a Match from a raw row using ALREADY-CACHED starting
  // odds. Never touches the network. Safe to call on the fast local tick.
  function buildMatch(b: any): Match {
    let odds: OddsResult | undefined
    if (b.status === 'live') {
      const base = oddsCache[b.id]           // seeded by the async fetch; may be undefined on very first paint
      if (base && b.start_price_a && b.start_price_b) {
        const currentA = livePricesRef.current[b.coin_a] || b.final_price_a || b.start_price_a
        const currentB = livePricesRef.current[b.coin_b] || b.final_price_b || b.start_price_b
        odds = getInPlayOdds(
          b.coin_a, b.coin_b,
          currentA, currentB,
          b.start_price_a, b.start_price_b,
          new Date(b.start_time).getTime(),
          new Date(b.end_time).getTime(),
          base,
          b.side_a_pool || 0,
          b.side_b_pool || 0,
          b.draw_pool || 0
        )
      } else {
        odds = base
      }
    }
    return {
      ...battleToMatch(b as Battle, odds),
      entries: b.tickets?.[0]?.count || 0,
    }
  }

  useEffect(() => {
    fetchBattles()

    const sub = supabase
      .channel('battles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battles' }, () => {
        fetchBattles()
      })
      .subscribe()

    // SLOW CLOCK (15s): pulls fresh pool + price data from Supabase and seeds
    // starting odds (the async CoinGecko path).
    const fetchTimer = setInterval(fetchBattles, 15000)

    // PRICE POLLER (5s, async): fetch live Pyth prices for all coins currently
    // in play, into livePricesRef. The DB's final_price_* columns are null, so
    // this is what actually feeds price movement into the odds engine.
    async function pollPrices() {
      const rows = rawBattlesRef.current
      if (rows.length === 0) return
      const tickers = Array.from(new Set(rows.flatMap((b) => [b.coin_a, b.coin_b])))
      try {
        const prices = await getPythPrices(tickers)
        if (Object.keys(prices).length > 0) {
          livePricesRef.current = { ...livePricesRef.current, ...prices }
        }
      } catch (e) {
        // Non-fatal: odds fall back to last known / start prices
      }
    }
    pollPrices()
    const priceTimer = setInterval(pollPrices, 5000)

    // FAST CLOCK (2s): pure-local recompute of odds + betting lock from the
    // rows we already have + cached live prices, using the current timestamp.
    // No network calls here. This makes odds drift smoothly toward close and
    // flips the 80% betting lock within 2s of the threshold.
    const tickTimer = setInterval(() => {
      if (rawBattlesRef.current.length === 0) return
      setMatches(rawBattlesRef.current.map(buildMatch))
    }, 2000)

    return () => {
      supabase.removeChannel(sub)
      clearInterval(fetchTimer)
      clearInterval(priceTimer)
      clearInterval(tickTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchBattles() {
    const { data, error } = await supabase
      .from('battles')
      .select('*, tickets(count)')
      .in('status', ['live', 'upcoming'])
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching battles:', error)
      setError(error.message || 'Failed to load battles')
      setLoading(false)
      return
    }
    setError(null)

    const rows = (data as any[]) || []

    // Seed starting odds (async, CoinGecko/momentum) for any live battle we
    // haven't cached yet. Only happens here, on the slow clock.
    await Promise.all(
      rows
        .filter((b) => b.status === 'live' && !oddsCache[b.id])
        .map(async (b) => {
          oddsCache[b.id] = await getStartingOdds(b.coin_a, b.coin_b)
        })
    )

    rawBattlesRef.current = rows
    setMatches(rows.map(buildMatch))
    setLoading(false)
  }

  return { matches, loading, error }
}
