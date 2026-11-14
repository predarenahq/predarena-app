"""
Fixes the starting prior, and makes the browser use the SAME prior the server
priced the battle with.

THE BUG. getStartingProbs built its favourite out of the volatility gap:

    volEdge   = (volB - volA) / 20
    totalEdge = (edge * 0.20 + volEdge + volSpread * sign(edge) * 0.10) * damp

createBattles calls it with momentum 0,0 (api/cron.mjs), so `edge` is 0 and
volEdge is the ONLY term left. Every battle came out favouring the calmer coin.
Live values pulled off the API, all nine favouring side A:

    BTC/SOL    0.494 / 0.312 / 0.194     <- widest vol gap, worst skew
    SOL/JUP    0.473 / 0.332 / 0.195
    BTC/ETH    0.449 / 0.354 / 0.197
    ETH/BNB    0.400 / 0.400 / 0.200     <- equal vol, no skew

Volatility is not a directional signal. With both coins at ~zero expected drift,
the difference of their returns is centred on zero whatever their variances are,
so P(A outperforms B) is 0.5 either way. Variance only widens the band where a
DRAW happens, which this prior barely moves.

What it cost: BTC/SOL priced A at 1/(0.494*1.3) = 1.56 and B at 1/(0.312*1.3) =
2.46. Against a true ~50/50 (draws being unwinnable while DRAW_THRESHOLD is 0),
side A returns 0.78 and side B returns 1.23. Always taking side B on the widest
pairs is +23% on the house before combos multiply it.

THE FIX, in three parts:
  1. volEdge and volSpread leave the directional term, and what remains is put
     behind a named MOMENTUM_WEIGHT that ships at 0. A flat 0.40/0.40/0.20 open
     is not exciting, but nothing in it can be arbitraged, and in-play movement
     still prices the battle as real information arrives.

     Why 0 and not just "use momentum": at the old weight of 0.20 an 8pp
     momentum spread opens a battle at 0.543/0.266, odds 1.42/2.89. If 24h
     momentum has no edge over the next hour, the underdog returns 1.45 per unit
     staked - a bigger leak than the volatility bug, pointing the other way.
     Replacing a signal that is provably wrong with one that is merely unproven
     is not an improvement. Measure first, then raise it.
  2. createBattles passes REAL 24h momentum, computed from price_history (the
     same table settlement trusts, no external API, no rate limit). The engine
     always took changeA/changeB and nothing was ever feeding them, so the
     plumbing goes in now; at weight 0 it changes no price, and turning it on
     later is a one-constant change.
  3. The browser stops recomputing its own prior from CoinGecko and reads
     base_prob_a/b/draw off the battle row. This part is NOT optional: fixing
     the server alone leaves the client quoting the old skewed line, every leg
     drifts ~20% past the 5% tolerance, and place-bet bounces every bet with
     odds_changed.

Existing live battles keep the base_prob_* they were created with. The new prior
applies to battles created after deploy; the client reads whatever is on the row
either way, so old and new battles both quote correctly.

Safe by construction: every anchor is verified to occur EXACTLY ONCE across all
five files before anything is written. Any mismatch aborts with nothing changed.
Each file is backed up to .bak.

Run from repo root:  python3 migrations/patch_odds_prior.py
"""
import sys, os, shutil

PRIOR_OLD = (
    "  const diff = changeA - changeB\n"
    "  const edge = Math.tanh(diff / 8)\n"
    "  const volEdge = (volB - volA) / 20\n"
    "  const volSpread = Math.abs(volA - volB) / 10\n"
    "  const totalEdge = (edge * 0.20 + volEdge + volSpread * Math.sign(edge) * 0.10) * volDampening\n"
)

PRIOR_NEW = (
    "  const diff = changeA - changeB\n"
    "  const edge = Math.tanh(diff / 8)\n"
    "  // Momentum is the only directional term left. The old prior also added\n"
    "  // (volB - volA) / 20, which made the calmer coin the favourite on nothing\n"
    "  // but being calmer: BTC 0.49 vs SOL 0.31 before a single price tick. A\n"
    "  // variance difference does not tell you which way a spread moves, only how\n"
    "  // wide it spreads, so it belongs nowhere near the A/B split.\n"
    "  //\n"
    "  // MOMENTUM_WEIGHT ships at 0 on purpose. At the old 0.20 an 8pp momentum\n"
    "  // spread opens a battle at 0.54/0.27 - a 2:1 favourite picked by 24h\n"
    "  // momentum alone. If that momentum does not actually predict the next hour,\n"
    "  // the underdog is +45% against us, which is a bigger hole than the one this\n"
    "  // patch closes. At 0 the book opens flat and only real in-play price\n"
    "  // movement moves it, which is information we can stand behind. Raise it\n"
    "  // once the backtest says momentum pays. See the note at the end of this\n"
    "  // patch for how to measure it.\n"
    "  const totalEdge = edge * MOMENTUM_WEIGHT * volDampening\n"
)

EDITS = [
  # ---- 1. the prior, server side -------------------------------------------
  ("lib/oddsEngine.mjs", [
    ("server momentum weight",
     "export const HOUSE_MARGIN = 1.30",
     "// How hard 24h momentum is allowed to tilt the opening line, as a share of\n"
     "// the probability mass. 0 = the book opens even and only in-play price\n"
     "// movement moves it. Was effectively 0.20, on top of a volatility term that\n"
     "// did the real damage. Do not raise this without evidence that momentum\n"
     "// predicts the next window; every point of unearned tilt is free money for\n"
     "// whoever takes the other side.\n"
     "export const MOMENTUM_WEIGHT = 0\n"
     "\n"
     "export const HOUSE_MARGIN = 1.30"),

    ("server prior", PRIOR_OLD, PRIOR_NEW),
  ]),

  # ---- 1b. the prior, client side (kept identical so any fallback agrees) ---
  ("src/services/oddsEngine.ts", [
    ("client momentum weight",
     "const HOUSE_MARGIN = 1.30  // 30% overround — heavy SportyBet-style house edge",
     "// Mirror of lib/oddsEngine.mjs. Keep the two in step: this is only reached\n"
     "// as a fallback now, but a fallback that disagrees with the server is how\n"
     "// the requote loop started.\n"
     "const MOMENTUM_WEIGHT = 0\n"
     "const HOUSE_MARGIN = 1.30  // 30% overround — heavy SportyBet-style house edge"),

    ("client prior",
     "  const diff = changeA - changeB\n"
     "  const edge = Math.tanh(diff / 8)\n"
     "  const volEdge = (volB - volA) / 20\n"
     "  const volSpread = Math.abs(volA - volB) / 10\n"
     "\n"
     "  const totalEdge = (edge * 0.20 + volEdge + volSpread * Math.sign(edge) * 0.10) * volDampening\n",
     "  const diff = changeA - changeB\n"
     "  const edge = Math.tanh(diff / 8)\n"
     "  // Momentum only, and weighted 0 by default. See lib/oddsEngine.mjs: the\n"
     "  // volatility gap was being used to pick a favourite, which is not\n"
     "  // something variance can tell you.\n"
     "  const totalEdge = edge * MOMENTUM_WEIGHT * volDampening\n"),

    # applyMargin has to be callable from useBattles so the browser can turn the
    # row's stored probabilities into the same OddsResult shape.
    ("export applyMargin",
     "function applyMargin(probA: number, probB: number, probDraw: number): OddsResult {",
     "export function applyMargin(probA: number, probB: number, probDraw: number): OddsResult {"),
  ]),

  # ---- 2. feed real momentum in ---------------------------------------------
  ("lib/cronHelpers.mjs", [
    ("momentum helper",
     "export async function getVaultLamports(rpcUrl) {",
     "// 24h momentum per coin, straight from price_history. The odds engine has\n"
     "// always taken changeA/changeB; createBattles was passing 0,0, so the\n"
     "// momentum half of the model never ran. price_history is the same series\n"
     "// settlement reads, it needs no external API, and it cannot rate-limit us.\n"
     "// A coin with too little history returns 0, which is an even prior.\n"
     "export async function get24hMomentum(supabase, coins) {\n"
     "  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()\n"
     "  const out = {}\n"
     "  await Promise.all([...new Set(coins)].map(async (coin) => {\n"
     "    out[coin] = 0\n"
     "    try {\n"
     "      const [oldest, newest] = await Promise.all([\n"
     "        supabase.from('price_history').select('price').eq('coin', coin)\n"
     "          .gte('recorded_at', since).order('recorded_at', { ascending: true }).limit(1),\n"
     "        supabase.from('price_history').select('price').eq('coin', coin)\n"
     "          .order('recorded_at', { ascending: false }).limit(1),\n"
     "      ])\n"
     "      const o = Number(oldest.data?.[0]?.price)\n"
     "      const n = Number(newest.data?.[0]?.price)\n"
     "      if (o > 0 && n > 0) out[coin] = ((n - o) / o) * 100\n"
     "    } catch (err) {\n"
     "      console.error('momentum failed for ' + coin + ':', err.message)\n"
     "    }\n"
     "  }))\n"
     "  return out\n"
     "}\n"
     "\n"
     "export async function getVaultLamports(rpcUrl) {"),
  ]),

  ("api/cron.mjs", [
    ("cron import",
     "import { sweepPendingDeposits, assertSolvency, getVaultLamports } from '../lib/cronHelpers.mjs'",
     "import { sweepPendingDeposits, assertSolvency, getVaultLamports, get24hMomentum } from '../lib/cronHelpers.mjs'"),

    ("cron momentum fetch",
     "  const tickers = [...new Set(BATTLE_PAIRS.flatMap(p => [p.coinA, p.coinB]))]\n"
     "  const prices = await getPythPrices(tickers)\n",
     "  const tickers = [...new Set(BATTLE_PAIRS.flatMap(p => [p.coinA, p.coinB]))]\n"
     "  const prices = await getPythPrices(tickers)\n"
     "  // Real 24h momentum for the starting prior. Hardcoding 0,0 here is what\n"
     "  // left the volatility gap as the only thing moving the line.\n"
     "  const momentum = await get24hMomentum(supabase, tickers)\n"),

    ("cron base probs",
     "    // Base probabilities stored on the battle so in-play pricing is\n"
     "    // deterministic. Volatility-aware even with neutral momentum.\n"
     "    const baseProbs = getStartingProbs(pair.coinA, pair.coinB, 0, 0)",
     "    // Base probabilities stored on the battle so in-play pricing is\n"
     "    // deterministic, and so the browser can quote the same line we will.\n"
     "    const baseProbs = getStartingProbs(\n"
     "      pair.coinA, pair.coinB,\n"
     "      momentum[pair.coinA] || 0,\n"
     "      momentum[pair.coinB] || 0,\n"
     "    )"),
  ]),

  # ---- 3. the browser reads the stored prior instead of inventing one -------
  ("src/hooks/useBattles.ts", [
    ("useBattles import",
     "import { getStartingOdds, getInPlayOdds, OddsResult } from '../services/oddsEngine'",
     "import { getStartingOdds, getInPlayOdds, applyMargin, OddsResult } from '../services/oddsEngine'"),

    ("useBattles seed",
     "    // Seed starting odds (async, CoinGecko/momentum) for any live battle we\n"
     "    // haven't cached yet. Only happens here, on the slow clock.\n"
     "    await Promise.all(\n"
     "      rows\n"
     "        .filter((b) => b.status === 'live' && !oddsCache[b.id])\n"
     "        .map(async (b) => {\n"
     "          oddsCache[b.id] = await getStartingOdds(b.coin_a, b.coin_b)\n"
     "        })\n"
     "    )",
     "    // Seed the prior from the BATTLE ROW. base_prob_a/b/draw is what the\n"
     "    // server priced this battle with and what it will price every quote\n"
     "    // against; recomputing our own here from CoinGecko meant the screen and\n"
     "    // the server disagreed, and anything past the 5% tolerance came back as\n"
     "    // odds_changed. The local engine is now only a fallback for a row that\n"
     "    // predates the column.\n"
     "    await Promise.all(\n"
     "      rows\n"
     "        .filter((b) => b.status === 'live' && !oddsCache[b.id])\n"
     "        .map(async (b) => {\n"
     "          oddsCache[b.id] =\n"
     "            b.base_prob_a != null && b.base_prob_b != null && b.base_prob_draw != null\n"
     "              ? applyMargin(Number(b.base_prob_a), Number(b.base_prob_b), Number(b.base_prob_draw))\n"
     "              : await getStartingOdds(b.coin_a, b.coin_b)\n"
     "        })\n"
     "    )"),
  ]),

  ("src/BattleDetailPage.tsx", [
    ("detail import",
     "import { getStartingOdds, getInPlayOdds, OddsResult } from './services/oddsEngine'",
     "import { getStartingOdds, getInPlayOdds, applyMargin, OddsResult } from './services/oddsEngine'"),

    ("detail seed",
     "    if (data && !baseOdds) {\n"
     "      try {\n"
     "        const base = await getStartingOdds(data.coin_a, data.coin_b)\n"
     "        setBaseOdds(base)\n"
     "        setEngineOdds(base)\n"
     "      } catch(e) { console.error('Engine odds error:', e) }\n"
     "    }",
     "    if (data && !baseOdds) {\n"
     "      try {\n"
     "        // Same rule as the homepage: the row's stored prior is the one the\n"
     "        // server quotes against, so quote against it here too.\n"
     "        const base =\n"
     "          data.base_prob_a != null && data.base_prob_b != null && data.base_prob_draw != null\n"
     "            ? applyMargin(Number(data.base_prob_a), Number(data.base_prob_b), Number(data.base_prob_draw))\n"
     "            : await getStartingOdds(data.coin_a, data.coin_b)\n"
     "        setBaseOdds(base)\n"
     "        setEngineOdds(base)\n"
     "      } catch(e) { console.error('Engine odds error:', e) }\n"
     "    }"),
  ]),
]


def main():
    problems, contents = [], {}
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

    for path, edits in EDITS:
        shutil.copy(path, path + ".bak")
        s = contents[path]
        for _, anchor, repl in edits:
            s = s.replace(anchor, repl, 1)
        open(path, "w").write(s)
        print("Patched %s (backup at %s.bak)" % (path, path))

    print("")
    print("Server and client now price from one prior. The volatility favourite")
    print("is gone; battles open flat at 1.92 / 1.92 / 3.85 until momentum is")
    print("switched on. Build before pushing - the client half is TSX:")
    print("  rm -f .eslintcache && CI=true npm run build")
    print("")
    print("TURNING MOMENTUM ON. The plumbing is live but MOMENTUM_WEIGHT is 0 in")
    print("lib/oddsEngine.mjs. Before raising it, check against your own settled")
    print("battles whether 24h momentum predicts anything: for each settled battle")
    print("take the 24h momentum of each coin as of start_time (price_history has")
    print("it), bucket by the A-minus-B spread, and look at how often coin A")
    print("actually won in each bucket. If the win rate does not climb with the")
    print("spread, momentum does not predict and the weight stays at 0. 247 settled")
    print("tickets is thin for this, so give it more battles before trusting it.")
    print("")
    print("Still open, and a product call rather than a bug: DRAW_THRESHOLD is 0")
    print("in lib/settlement.mjs, so a draw needs an exact tie between two TWAP")
    print("averages and effectively cannot land. Draw is currently priced near 4x")
    print("on an outcome that does not happen. Either give it a real band or stop")
    print("offering the leg.")


if __name__ == "__main__":
    main()
