import { newsHandler }     from '../lib/newsHandler.mjs'
import { momentumHandler } from '../lib/momentumHandler.mjs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function betsHandler(req, res) {
  const username = req.query?.username
  const offset = parseInt(req.query?.offset || '0', 10) || 0
  if (!username) return res.status(400).json({ error: 'missing_username' })
  const { data, error } = await supabase.rpc('public_bets', { p_username: username, p_offset: offset, p_limit: 10 })
  if (error) {
    console.error('public_bets error:', error.message)
    return res.status(500).json({ error: 'bets_failed' })
  }
  if (!data?.found) return res.status(404).json({ error: 'not_found' })
  res.setHeader('Cache-Control', 's-maxage=30')
  return res.status(200).json(data)
}

async function profileHandler(req, res) {
  const username = req.query?.username
  if (!username) return res.status(400).json({ error: 'missing_username' })
  const { data, error } = await supabase.rpc('public_profile', { p_username: username })
  if (error) {
    console.error('public_profile error:', error.message)
    return res.status(500).json({ error: 'profile_failed' })
  }
  if (!data?.found) return res.status(404).json({ error: 'not_found' })
  // net_pnl stripped: private by default. Never returns addresses/balances.
  const { net_pnl, ...publicFields } = data
  res.setHeader('Cache-Control', 's-maxage=60')
  return res.status(200).json(publicFields)
}

async function searchHandler(req, res) {
  const q = (req.query?.q || '').trim()
  if (q.length < 2) return res.status(200).json([])
  const { data, error } = await supabase.rpc('search_users', { p_query: q })
  if (error) {
    console.error('search_users error:', error.message)
    return res.status(500).json({ error: 'search_failed' })
  }
  res.setHeader('Cache-Control', 's-maxage=30')
  return res.status(200).json(data || [])
}

/**
 * News + momentum behind one function.
 *
 * Not a rewrite: both handlers moved to lib/ untouched. The Hobby plan caps
 * Serverless Functions at 12 and we were at 12, so the authenticated reads
 * endpoint had nowhere to live. These two are the cheapest merge on the board -
 * content only, no money path, no signing.
 *
 * Routed by ?type= rather than by body, because momentum is a GET with a query
 * string (oddsEngine calls it on the pricing path) and news is a plain GET.
 */
// Battle list for the dashboard. Server-side + service role so the tickets(count)
// join works after the RLS lockdown dropped the public read on tickets. The
// client used to query battles+tickets directly with the anon key; that join is
// now blocked, which silently emptied the list and left the app on mock data.
// Single battle by id for the detail page. Server-side + service role so it
// doesn't depend on the client anon key (which broke with 406 when a build
// didn't inline REACT_APP_SUPABASE_ANON_KEY) and survives a future battles lockdown.
async function battleHandler(req, res) {
  const id = req.query?.id
  if (!id) return res.status(400).json({ error: 'missing_id' })
  const { data, error } = await supabase.from('battles').select('*').eq('id', id).single()
  if (error) {
    console.error('battle fetch error:', error.message)
    return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: 'battle_failed' })
  }
  return res.status(200).json({ battle: data })
}

async function battlesHandler(req, res) {
  const { data, error } = await supabase
    .from('battles')
    .select('*, tickets(count)')
    .in('status', ['live', 'upcoming'])
    .order('start_time', { ascending: true })
  if (error) {
    console.error('battles fetch error:', error.message)
    return res.status(500).json({ error: 'battles_failed' })
  }
  return res.status(200).json({ battles: data || [] })
}

export default async function handler(req, res) {
  const type = req.query?.type
  if (type === 'news')     return newsHandler(req, res)
  if (type === 'momentum') return momentumHandler(req, res)
  if (type === 'profile')  return profileHandler(req, res)
  if (type === 'bets')     return betsHandler(req, res)
  if (type === 'search')   return searchHandler(req, res)
  if (type === 'battles')  return battlesHandler(req, res)
  if (type === 'battle')   return battleHandler(req, res)
  return res.status(400).json({ error: 'invalid_type' })
}
