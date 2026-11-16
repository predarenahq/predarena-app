"""
Two things, both fallout from the Pyth outage.

PART 1 - XRP's feed id is wrong, and has always been wrong.
Verified live against your own /api/content?type=prices:

  0xec5d...cd07  (api/*.mjs, 5 files)         -> 404 feed does not exist
  0x50c6...4349  (src/services/pythPrices.ts) -> 404 feed does not exist
  0xec5d...a1c8  (from Hermes /v2/price_feeds) -> OK, $0.9495

Two different wrong ids in one repo, so this was never a plan problem. XRP IS
covered by your Pyth plan; the id was simply never right. Fixing it brings
XRP/BNB back, which is a fifth live pair for free.

PART 2 - Only 6 of your 13 feeds are served by the current plan.
Tested one feed at a time through the deployed proxy on 2026-11-16:

  served : BTC, ETH, SOL, BNB, DOGE, XRP (once its id is fixed)
  403    : AVAX, LINK, UNI, PEPE, JUP, WIF, BONK

A pair touching an unserved feed is skipped by createBattles with no price, so
it just never appears - silently, exactly the way the whole app failed in
August. This adds AVAILABLE_FEEDS and filters BATTLE_PAIRS through it, so the
gap is declared rather than discovered, and logs the parked pairs at startup.

WHEN YOUR PLAN GROWS: add the ticker to AVAILABLE_FEEDS. That is the entire
change - the pair list itself stays intact as the source of truth, in both
cron.mjs and pythPrices.ts.

Live after this patch:  BTC/ETH, BTC/SOL, ETH/BNB, ETH/SOL, XRP/BNB
Still parked:           SOL/AVAX, DOGE/PEPE, WIF/BONK, LINK/UNI, SOL/JUP
(DOGE is served but PEPE is not, so the Meme league stays dark either way.)

PART 3 - The heartbeat.
The outage lasted 82 days because every single run returned HTTP 200 while
doing nothing. Two changes:

  a) a cron_runs row per run, so "when did this last actually work" is a query
  b) with CRON_STRICT_STATUS=1, a run that saved zero prices returns 503, so
     cron-job.org's own failure alert fires

(b) is OPT-IN on purpose. A free cron-job.org account disables a job after
repeated failures, which is the right trade only once you are watching the
mailbox. Turn it on after you have confirmed a few green runs.

Run the SQL in migrations/cron_runs.sql BEFORE deploying this, or every run
logs a failed heartbeat insert (harmless, wrapped, but noisy).

Safe by construction: every anchor verified to occur EXACTLY ONCE before
anything is written. Backs each file up to .bak.

Run from repo root:  python3 migrations/patch_feeds_heartbeat.py
"""
import sys, os, shutil

XRP_BAD_SERVER = '0xec5d399846a9209f3fe5881d70aae9268c7b040d3ce7b657b5af68ee9e46cd07'
XRP_BAD_CLIENT = '0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feeff2d13323997f4a4349'
XRP_GOOD       = '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8'

FEEDS_NOTE = '''// Feeds the current Pyth plan actually serves. Verified 2026-11-16 by calling
// each one individually: everything outside this set comes back 403, and a
// batch containing even one unserved id fails whole, so do not merge these
// into a single request while the gap exists.
//
// A pair touching an unserved feed is skipped with no price and simply never
// appears in the Arena. That is the same silent-failure shape that hid the
// August outage for 82 days, so the gap is declared here instead.
//
// WHEN YOUR PLAN GROWS: add the ticker here. That is the whole change.
const AVAILABLE_FEEDS = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP'])

const ALL_BATTLE_PAIRS = ['''

FEEDS_FILTER = '''
]

const BATTLE_PAIRS = ALL_BATTLE_PAIRS.filter(
  (p) => AVAILABLE_FEEDS.has(p.coinA) && AVAILABLE_FEEDS.has(p.coinB)
)

{
  const parked = ALL_BATTLE_PAIRS.filter((p) => !BATTLE_PAIRS.includes(p))
  if (parked.length) {
    console.warn(
      `${parked.length} pair(s) parked - feed not on the current Pyth plan: ` +
      parked.map((p) => `${p.coinA}/${p.coinB}`).join(', ')
    )
  }
}'''

# The client keeps its own copy of the set and the list. A single shared module
# would be better, but src/ cannot import from lib/ in this CRA setup without a
# build change, and an outage fix is the wrong moment for one. If these two
# drift, the browser quotes a pair the server will not create.
CLIENT_NOTE = FEEDS_NOTE

CLIENT_FILTER = '''
]

export const BATTLE_PAIRS = ALL_BATTLE_PAIRS.filter(
  (p) => AVAILABLE_FEEDS.has(p.coinA) && AVAILABLE_FEEDS.has(p.coinB)
)'''

HEARTBEAT = '''  // Heartbeat. One row per run, so "when did this last actually work?" is a
  // query rather than an archaeology project. The August outage was invisible
  // for 82 days precisely because every run returned 200 with an empty body of
  // work and nothing recorded that it had done nothing.
  try {
    await supabase.from('cron_runs').insert({
      ok: results.errors.length === 0,
      prices_saved: results.pricesSaved,
      battles_created: results.battlesCreated,
      battles_settled: results.battlesSettled,
      errors: results.errors.length ? results.errors : null,
    })
  } catch (e) {
    console.error('heartbeat insert failed:', e.message)
  }

  // A run that saved no prices did nothing useful, whatever else it logged.
  // With CRON_STRICT_STATUS=1 that becomes a non-2xx so the scheduler's own
  // failure alert fires - the alert this app never had. Opt-in because a free
  // cron-job.org account disables a job after repeated failures, which is the
  // right trade only once someone is watching the mailbox.
  const didNothing = !results.pricesSaved
  const strict = process.env.CRON_STRICT_STATUS === '1'

  res.status(didNothing && strict ? 503 : 200).json({
    ok: results.errors.length === 0 && !didNothing,
    timestamp: new Date().toISOString(),
    prices,
    ...results
  })
}'''

SERVER_FEED_FILES = [
  "api/cron.mjs",
  "api/place-bet.mjs",
  "api/arc-keeper.mjs",
  "api/arc-quote.mjs",
  "api/arc-combo-quote.mjs",
]

EDITS = []

# ---- XRP id, server side -----------------------------------------------------
for _f in SERVER_FEED_FILES:
    EDITS.append((_f, [("xrp feed id", XRP_BAD_SERVER, XRP_GOOD)]))

# ---- cron.mjs: pair filter + heartbeat ---------------------------------------
EDITS.append(("api/cron.mjs", [
  ("pairs header",
   "const BATTLE_PAIRS = [\n"
   "  { coinA: 'BTC', coinB: 'ETH', league: 'Major', duration: '1h' },",
   FEEDS_NOTE + "\n  { coinA: 'BTC', coinB: 'ETH', league: 'Major', duration: '1h' },"),

  ("pairs filter",
   "  { coinA: 'ETH', coinB: 'SOL', league: 'L1', duration: '4h' },\n]",
   "  { coinA: 'ETH', coinB: 'SOL', league: 'L1', duration: '4h' }," + FEEDS_FILTER),

  ("heartbeat",
   "  res.status(200).json({ \n"
   "    ok: results.errors.length === 0, \n"
   "    timestamp: new Date().toISOString(), \n"
   "    prices,\n"
   "    ...results\n"
   "  })\n"
   "}",
   HEARTBEAT),
]))

# ---- client: XRP id + same filter --------------------------------------------
EDITS.append(("src/services/pythPrices.ts", [
  ("client xrp feed id", XRP_BAD_CLIENT, XRP_GOOD),

  ("client pairs header",
   "export const BATTLE_PAIRS = [\n"
   "  { coinA: 'BTC', coinB: 'ETH', league: 'Major', duration: '1h' },",
   CLIENT_NOTE + "\n  { coinA: 'BTC', coinB: 'ETH', league: 'Major', duration: '1h' },"),

  ("client pairs filter",
   "  { coinA: 'ETH', coinB: 'SOL', league: 'L1', duration: '4h' },\n]",
   "  { coinA: 'ETH', coinB: 'SOL', league: 'L1', duration: '4h' }," + CLIENT_FILTER),
]))

CRON_RUNS_SQL = '''-- Heartbeat table for /api/cron.
--
-- The August 2026 outage lasted 82 days because the endpoint returned HTTP 200
-- on every run while settling nothing, creating nothing and recording no
-- prices. Nothing anywhere said "this run did no work". This fixes that.
--
-- Service role writes it; RLS is on with no policies, so nothing client-side
-- can read or write it. Same posture as the rest of the schema.

create table if not exists cron_runs (
  id              bigserial primary key,
  ran_at          timestamptz not null default now(),
  ok              boolean     not null,
  prices_saved    int,
  battles_created int,
  battles_settled int,
  errors          jsonb
);

create index if not exists cron_runs_ran_at_idx on cron_runs (ran_at desc);

alter table cron_runs enable row level security;

-- Is the cron alive? Run this any time.
--
--   select max(ran_at)                                  as last_run,
--          now() - max(ran_at)                          as age,
--          max(ran_at) filter (where prices_saved > 0)  as last_useful_run,
--          now() - max(ran_at) filter (where prices_saved > 0) as useful_age
--   from cron_runs;
--
-- last_run recent but last_useful_run old is the exact shape of the August
-- failure: the job is firing, the work is not happening.
'''


def main():
    problems, contents, order = [], {}, []
    for path, edits in EDITS:
        if path not in contents:
            if not os.path.exists(path):
                problems.append("  %s: file not found (run from repo root)" % path)
                continue
            contents[path] = open(path).read()
            order.append(path)

    if problems:
        print("ABORTED - nothing written:")
        print("\n".join(problems))
        sys.exit(1)

    for path, edits in EDITS:
        s = contents[path]
        for label, anchor, _ in edits:
            n = s.count(anchor)
            if n != 1:
                problems.append("  [%s :: %s] anchor found %d times (expected 1)" % (path, label, n))

    if problems:
        print("ABORTED - nothing written. Anchor mismatch:")
        print("\n".join(problems))
        sys.exit(1)

    for path in order:
        shutil.copy(path, path + ".bak")

    for path, edits in EDITS:
        s = contents[path]
        for _, anchor, repl in edits:
            s = s.replace(anchor, repl, 1)
        contents[path] = s

    for path in order:
        open(path, "w").write(contents[path])
        print("Patched %s (backup at %s.bak)" % (path, path))

    os.makedirs("migrations", exist_ok=True)
    open("migrations/cron_runs.sql", "w").write(CRON_RUNS_SQL)
    print("Created migrations/cron_runs.sql")

    print("")
    print("XRP fixed in 6 files (two different wrong ids). Pairs now filter")
    print("through AVAILABLE_FEEDS; 5 live, 5 parked until the plan covers them.")
    print("")
    print("DO THIS BEFORE DEPLOYING: run migrations/cron_runs.sql in Supabase,")
    print("or every run logs a failed heartbeat insert.")
    print("")
    print("CRON_STRICT_STATUS is OFF until you set it to 1 in Vercel. Turn it on")
    print("after a few green runs - it makes a do-nothing run return 503 so")
    print("cron-job.org emails you instead of showing green forever.")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
