import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SOL_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'

async function getSolPrice() {
  try {
    const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_FEED}`)
    if (!res.ok) return null
    const p = (await res.json())?.parsed?.[0]
    if (!p) return null
    const price = Number(p.price.price) * Math.pow(10, p.price.expo)
    return price > 0 ? price : null
  } catch {
    return null
  }
}

/**
 * Everything /admin needs, read with the service role.
 *
 * The page used to query Supabase from the BROWSER with the anon key, and its
 * password only gated rendering - so the data was never protected at all. It is
 * also how the waitlist (real names and emails) was world-readable. Those tables
 * are RLS-locked now, which is why the page's Overview and Waitlist tabs are
 * currently empty: they are correctly being refused.
 *
 * ADMIN_SECRET is server-only. It must NOT be prefixed REACT_APP_ - that would
 * inline it into the public bundle, which is exactly the bug we are fixing
 * (`const ADMIN_PASSWORD = 'preda2026admin'` shipped to every visitor).
 *
 * Note `!secret ||`: an unset ADMIN_SECRET locks the endpoint rather than
 * opening it. cron.mjs takes the opposite approach - unset means warn and allow
 * - which is a footgun worth not copying.
 */
export default async function handler(req, res) {
  const secret = process.env.ADMIN_SECRET
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  try {
    const [pnl, treasury, battles, waitlist, balances, solPrice] = await Promise.all([
      // Ticket-derived P&L: computed from what happened, so it cannot drift.
      supabase.rpc('admin_pnl'),
      // The lamports counter, for comparison only. It is denominated in SOL, so
      // every settlement converts USD->lamports at that moment's price and the
      // total moves with FX even when nobody bets. Shown side by side with the
      // truth rather than trusted.
      supabase.from('platform_treasury').select('*').single(),
      supabase.from('battles').select('*, tickets(count)').order('created_at', { ascending: false }).limit(20),
      supabase.from('waitlist').select('*').order('signed_up_at', { ascending: false }),
      supabase.from('user_balances').select('*').order('balance_lamports', { ascending: false }).limit(50),
      getSolPrice(),
    ])

    return res.status(200).json({
      ok: true,
      pnl:      pnl.data || [],
      treasury: treasury.data || null,
      battles:  battles.data || [],
      waitlist: waitlist.data || [],
      balances: balances.data || [],
      // null means unknown. The page hardcoded 85 and valued every user balance
      // with it; UserBalancePanel had the same bug with 150. Never invent a price.
      solPrice,
    })
  } catch (err) {
    console.error('admin-stats error:', err.message)
    return res.status(500).json({ error: 'stats_failed' })
  }
}
