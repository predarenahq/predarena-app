import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Battle = {
  id: string
  on_chain_address: string | null
  coin_a: string
  coin_b: string
  league: string
  duration: string
  start_time: string
  end_time: string
  start_price_a: number | null
  start_price_b: number | null
  final_price_a: number | null
  final_price_b: number | null
  side_a_pool: number
  side_b_pool: number
  draw_pool: number
  total_pool: number
  status: 'upcoming' | 'live' | 'settled' | 'cancelled'
  winner: number
  created_at: string
}

export type Ticket = {
  id: string
  battle_id: string
  wallet_address: string
  side: number
  stake: number
  odds: number | null
  claimed: boolean
  on_chain_tx: string | null
  created_at: string
}
