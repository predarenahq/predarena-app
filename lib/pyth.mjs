/**
 * One place that knows how to talk to Pyth Hermes.
 *
 * The Pyth Core upgrade (26 Aug 2026, 16:00 UTC) made an API key mandatory on
 * hermes.pyth.network. Eleven call sites in this app were reading it
 * unauthenticated; all of them began returning 401 that afternoon, and because
 * every one of them treats a non-OK response as "no price", the app kept
 * answering HTTP 200 while settling nothing for 82 days.
 *
 * Everything that needs a price goes through here now, so the next time Pyth
 * moves it is one edit, and a missing key says so instead of looking like a
 * quiet market.
 */
const BASE = (process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network').replace(/\/+$/, '')
const KEY = process.env.PYTH_API_KEY

let warned = false

export function pythConfigured() {
  return Boolean(KEY)
}

/**
 * GET /v2/updates/price/latest with the key attached.
 * `query` is the already-built query string, e.g. `ids[]=0xabc&ids[]=0xdef`.
 */
export async function hermesGet(query) {
  if (!KEY && !warned) {
    warned = true
    console.error(
      'PYTH_API_KEY is not set. Hermes has required a key since the Pyth Core ' +
      'upgrade (26 Aug 2026 16:00 UTC), so every price read returns 401 and ' +
      'nothing will settle. Set PYTH_API_KEY in the Vercel project env.'
    )
  }
  return fetch(`${BASE}/v2/updates/price/latest?${query}`, {
    headers: KEY ? { Authorization: `Bearer ${KEY}` } : {},
  })
}
