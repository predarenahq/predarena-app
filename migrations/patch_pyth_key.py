"""
Restores price reads. Routes all 11 Pyth Hermes call sites through one helper
that sends the API key the Pyth Core upgrade made mandatory.

WHAT HAPPENED. The Pyth Core upgrade took effect 26 Aug 2026 at 16:00 UTC and
made an API key required on hermes.pyth.network. The last row this app ever
wrote to price_history is 26 Aug 2026 16:16:03 UTC. Verified live: Hermes now
answers /v2/updates/price/latest with 401 unauthorized to an unauthenticated
caller, while /v2/price_feeds (metadata, unauthenticated) still returns 200 and
confirms the feed ids in this repo are still correct. Nothing in this codebase
broke. The dependency moved.

WHY IT WAS SILENT FOR 82 DAYS. Every call site does `if (!res.ok) return`, so a
401 reads as "no price" rather than as an error, and api/cron.mjs try/catches
each stage separately. The result:

  getPythPrices()  -> {}            (401 swallowed)
  finalizeBattles  -> continue      ("missing prices ... leaving live")
  settleBattles    -> throws        (sol_price_unavailable, caught by handler)
  createBattles    -> no inserts    (and every pair already has a live battle)
  price_history    -> 0 rows        (priceRows is empty, nothing to insert)
  the handler      -> HTTP 200      with ok:false in the body

cron-job.org has been seeing a green 200 on every run. The job never "failed",
so nothing ever alerted. That is the real defect here, and it is why step 3 of
this patch makes a missing key loud.

THE DEADLOCK. createBattles skips any pair that already has a live battle. The
nine battles that could not settle are still live, so they block creation of
every pair forever. They unblock themselves once settlement works again.

WHAT THIS PATCH DOES
  1. Adds lib/pyth.mjs: one BASE + one Authorization: Bearer header, one place
     to change when Pyth moves again.
  2. Rewrites all 8 server call sites to go through it.
  3. Logs loudly, once, when PYTH_API_KEY is missing.
  4. Adds /api/content?type=prices and points the 3 BROWSER call sites at it.
     The key is a server secret and a CRA bundle is public, so a key shipped to
     the browser is a published key. The proxy validates ids against
     /^0x[0-9a-f]{64}$/ and caps them at 16 so it cannot be used as an open
     relay to arbitrary Hermes queries. No new function slot: content.mjs is
     already deployed and you are at 12/12.

BEFORE THIS HELPS, SET PYTH_API_KEY IN VERCEL. Get one at app.pyth.com. Without
it the patch changes nothing except that the logs finally say why.

AND DECIDE ON THE NINE STALE BATTLES FIRST. The moment prices return, the next
cron run settles all nine against the TWAP window at their original end_time
(26 Aug). The 90s window will be thin, so it falls through to a LIVE price --
today's price against an August start price. Those results would be nonsense.
Void and refund them before the first successful run.

Safe by construction: every anchor verified to occur EXACTLY ONCE across all
files before anything is written. Backs each up to .bak.

Run from repo root:  python3 migrations/patch_pyth_key.py
"""
import sys, os, shutil

PYTH_LIB = '''/**
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
const BASE = (process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network').replace(/\\/+$/, '')
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
'''

PRICES_HANDLER = '''// Browser price reads proxy through here. The Hermes key is a server secret and
// a CRA bundle is public, so a key shipped to the browser is a published key.
// ids are validated and capped so this cannot be used as an open relay.
async function pricesHandler(req, res) {
  const ids = String(req.query?.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^0x[0-9a-f]{64}$/i.test(s))
    .slice(0, 16)
  if (!ids.length) return res.status(400).json({ error: 'no_ids' })
  try {
    const r = await hermesGet(ids.map((id) => `ids[]=${id}`).join('&'))
    if (!r.ok) return res.status(502).json({ error: 'pyth_unavailable', status: r.status })
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=30')
    return res.status(200).json(data)
  } catch (e) {
    console.error('prices proxy failed:', e.message)
    return res.status(502).json({ error: 'pyth_unavailable' })
  }
}

'''

EDITS = [
  # ---- server call sites ---------------------------------------------------
  ("api/cron.mjs", [
    ("cron import",
     "import { verifyDeposit } from '../lib/verifyDeposit.mjs'",
     "import { verifyDeposit } from '../lib/verifyDeposit.mjs'\n"
     "import { hermesGet } from '../lib/pyth.mjs'"),
    ("cron fetch",
     "      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`\n"
     "      const res = await fetch(url)",
     "      const res = await hermesGet(`ids[]=${feedId}`)"),
  ]),

  ("api/arc-keeper.mjs", [
    ("keeper fetch",
     "      const res  = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`)",
     "      const res  = await hermesGet(`ids[]=${PYTH_FEEDS[ticker]}`)"),
  ]),

  ("api/arc-quote.mjs", [
    ("arc-quote fetch",
     "      const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`)",
     "      const res = await hermesGet(`ids[]=${PYTH_FEEDS[ticker]}`)"),
  ]),

  ("api/arc-combo-quote.mjs", [
    ("arc-combo fetch",
     "      const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`)",
     "      const res = await hermesGet(`ids[]=${PYTH_FEEDS[ticker]}`)"),
  ]),

  ("api/place-bet.mjs", [
    ("place-bet batch fetch",
     "      const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS[ticker]}`)",
     "      const res = await hermesGet(`ids[]=${PYTH_FEEDS[ticker]}`)"),
    ("place-bet sol fetch",
     "  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_FEED}`)\n"
     "  if (!res.ok) throw new Error('pyth_unavailable')",
     "  const res = await hermesGet(`ids[]=${SOL_FEED}`)\n"
     "  if (!res.ok) throw new Error('pyth_unavailable')"),
  ]),

  ("api/admin-stats.mjs", [
    ("admin-stats fetch",
     "    const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_FEED}`)",
     "    const res = await hermesGet(`ids[]=${SOL_FEED}`)"),
  ]),

  ("lib/withdrawHandler.mjs", [
    ("withdraw fetch",
     "  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_FEED}`)\n"
     "  if (!res.ok) return null",
     "  const res = await hermesGet(`ids[]=${SOL_FEED}`)\n"
     "  if (!res.ok) return null"),
  ]),

  # ---- the browser proxy ---------------------------------------------------
  ("api/content.mjs", [
    ("content prices handler",
     "export default async function handler(req, res) {",
     PRICES_HANDLER + "export default async function handler(req, res) {"),
    ("content prices route",
     "  if (type === 'leaderboard') return leaderboardHandler(req, res)",
     "  if (type === 'leaderboard') return leaderboardHandler(req, res)\n"
     "  if (type === 'prices')   return pricesHandler(req, res)"),
  ]),

  # ---- browser call sites --------------------------------------------------
  ("src/services/pythPrices.ts", [
    ("client base",
     "const HERMES_BASE = 'https://hermes.pyth.network/v2/updates/price/latest'\n"
     "\n"
     "// Single REST call to Hermes for a batch of tickers. Returns ticker -> USD price.\n"
     "// Uses the same endpoint/parse as the bet flow — no SDK, no module-interop issues.",
     "// Hermes needs an API key since the Pyth Core upgrade, and a key in a CRA\n"
     "// bundle is a published key, so the browser asks our own server instead.\n"
     "// Same Hermes response shape comes back, so the parse below is unchanged.\n"
     "const PRICE_API = '/api/content?type=prices'\n"
     "\n"
     "// Single REST call for a batch of tickers. Returns ticker -> USD price."),
    ("client params",
     "    params.push(`ids[]=${feed}`)",
     "    params.push(feed)"),
    ("client fetch",
     "    const res = await fetch(`${HERMES_BASE}?${params.join('&')}`)",
     "    const res = await fetch(`${PRICE_API}&ids=${params.join(',')}`)"),
  ]),

  ("src/PredaLandingDashboardMockup.tsx", [
    ("dashboard sol fetch",
     "      const res = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')",
     "      const res = await fetch('/api/content?type=prices&ids=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')"),
  ]),

  ("src/BattleDetailPage.tsx", [
    ("battle sol fetch",
     "      const res = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')",
     "      const res = await fetch('/api/content?type=prices&ids=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')"),
  ]),
]

# Files that gain `hermesGet` and need the import. cron.mjs is handled above
# because its import anchor is specific.
NEEDS_IMPORT = {
  "api/arc-keeper.mjs":      "../lib/pyth.mjs",
  "api/arc-quote.mjs":       "../lib/pyth.mjs",
  "api/arc-combo-quote.mjs": "../lib/pyth.mjs",
  "api/place-bet.mjs":       "../lib/pyth.mjs",
  "api/admin-stats.mjs":     "../lib/pyth.mjs",
  "api/content.mjs":         "../lib/pyth.mjs",
  "lib/withdrawHandler.mjs": "./pyth.mjs",
}


def insert_import(src, rel):
    """Put the import after the file's last top-level import line."""
    line = "import { hermesGet } from '%s'" % rel
    if line in src:
        return src
    lines = src.split("\n")
    last = -1
    for i, l in enumerate(lines):
        if l.startswith("import ") and (" from " in l or l.rstrip().endswith("'")):
            last = i
    if last < 0:
        return line + "\n" + src
    lines.insert(last + 1, line)
    return "\n".join(lines)


def main():
    problems, contents = [], {}

    if os.path.exists("lib/pyth.mjs"):
        problems.append("  lib/pyth.mjs already exists - this patch looks applied")

    for path, edits in EDITS:
        if not os.path.exists(path):
            problems.append("  %s: file not found (run from repo root)" % path)
            continue
        s = open(path).read()
        contents[path] = s
        for label, anchor, _ in edits:
            n = s.count(anchor)
            if n != 1:
                problems.append("  [%s :: %s] anchor found %d times (expected 1)" % (path, label, n))

    if problems:
        print("ABORTED - nothing written. Anchor mismatch:")
        print("\n".join(problems))
        sys.exit(1)

    open("lib/pyth.mjs", "w").write(PYTH_LIB)
    print("Created lib/pyth.mjs")

    for path, edits in EDITS:
        shutil.copy(path, path + ".bak")
        s = contents[path]
        for _, anchor, repl in edits:
            s = s.replace(anchor, repl, 1)
        if path in NEEDS_IMPORT:
            s = insert_import(s, NEEDS_IMPORT[path])
        open(path, "w").write(s)
        print("Patched %s (backup at %s.bak)" % (path, path))

    print("")
    print("All 11 Pyth call sites now send the key. The 3 browser ones go")
    print("through /api/content?type=prices so the key stays server-side.")
    print("")
    print("THIS DOES NOTHING UNTIL YOU SET PYTH_API_KEY IN VERCEL.")
    print("Get one at app.pyth.com, add it to the project env, redeploy.")
    print("")
    print("AND VOID THE NINE STALE BATTLES FIRST. The next successful cron run")
    print("settles them against a live price versus an August start price.")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
