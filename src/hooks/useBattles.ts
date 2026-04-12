import { useEffect, useState } from 'react'
import { supabase, Battle } from '../lib/supabase'
import { getStartingOdds, getInPlayOdds, OddsResult } from '../services/oddsEngine'

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

  if (battle.status === 'upcoming') {
    const diff = start.getTime() - now.getTime()
    const mins = Math.floor(diff / 60000)
    return `Starts in ${mins}m`
  }

  const diff = end.getTime() - now.getTime()
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)

  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
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
  }
}

export function useBattles() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBattles()

    const sub = supabase
      .channel('battles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battles' }, () => {
        fetchBattles()
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  async function fetchBattles() {
    const { data, error } = await supabase
      .from('battles')
      .select('*, tickets(count)')
      .in('status', ['live', 'upcoming'])
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching battles:', error)
      return
    }

    const matchesWithOdds = await Promise.all((data as any[]).map(async (b) => {
      // Use engine odds for live battles
      let odds: OddsResult | undefined
      if (b.status === 'live') {
        if (!oddsCache[b.id]) {
          // Seed starting odds from 24h momentum
          oddsCache[b.id] = await getStartingOdds(b.coin_a, b.coin_b)
        }
        const base = oddsCache[b.id]
        // If we have live prices, compute in-play odds
        if (b.start_price_a && b.start_price_b) {
          const currentA = b.final_price_a || b.start_price_a
          const currentB = b.final_price_b || b.start_price_b
          odds = getInPlayOdds(
            b.coin_a, b.coin_b,
            currentA, currentB,
            b.start_price_a, b.start_price_b,
            new Date(b.start_time).getTime(),
            new Date(b.end_time).getTime(),
            base
          )
        } else {
          odds = base
        }
      }
      return {
        ...battleToMatch(b as Battle, odds),
        entries: b.tickets?.[0]?.count || 0
      }
    }))
    setMatches(matchesWithOdds)
    setLoading(false)
  }

  return { matches, loading }
}
