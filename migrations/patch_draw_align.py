"""
Makes Solana grade battles the same way the Arc contract does, and prices the
draw at the rate it actually happens.

THE BUG. One `battles` row serves both chains, but each decides its own winner:

  lib/settlement.mjs   DRAW_THRESHOLD = 0        -> exact tie only
  PredArena.sol        DRAW_THRESHOLD_BPS = 10   -> 0.1% band (0.001)

Measured over 9,497 settled battles, they disagree on 2,431 of them (25.6%).
The contract called 2,509 draws that the DB recorded as a win for a coin.

That split matters because the two are wired to different things. Arc payouts
follow the contract (arc-keeper claims against getBattle().winner). History,
Stats and the leaderboard follow battles.winner, which settlement.mjs writes.
So on a quarter of Arc battles a user is paid one result and shown another, in
both directions: back a coin on a contract-called draw and you get nothing but
read "Won"; back the draw and you are paid but read "Lost".

DRAW_THRESHOLD_BPS is `constant` in a deployed contract, so it cannot move
without a redeploy. Solana is the side that has to match: 0.001, not a tuned
per-duration value, because any other number re-opens the same divergence.

PRICING. With the band restored, draws are not rare. Measured rates at 0.001:

    30m   24.8%      (4,204 settled)
    1h    29.7%      (4,414 settled)
    4h    17.9%      (879 settled)

The engine charges a flat 0.20. That gap is the real cause of the original
"it called clear winners draws" complaint: the band was defensible, the price
was not. At a 1.30 overround the house is meant to hold ~23% on every leg; a
20% price against a 26% true rate hands draw backers a small edge and overholds
on A/B. So probDraw becomes duration-aware and the remainder splits between A
and B.

1D (XRP/BNB) had no settled battles in the sample, so it falls back to the 4h
rate. That overstates draw probability for a longer window, which errs toward
the house rather than against it - re-measure once 1D battles settle.

ALSO FIXED. arc-keeper anchored its TWAP window to Date.now() at keeper run
time while settlement.mjs anchors to the battle's end_time. The keeper runs
every two minutes, so the two chains could read prices from windows up to two
minutes apart and disagree on the winner from timing alone, even with identical
rules. Now both use [end - 90s, end].

Safe by construction: every anchor verified to occur EXACTLY ONCE across all
five files before anything is written. Backs each up to .bak.

Run from repo root:  python3 migrations/patch_draw_align.py
"""
import sys, os, shutil

DRAW_RATE_BLOCK = '''export const MOMENTUM_WEIGHT = 0

// How often a battle actually ends inside the contract's 0.1% draw band,
// measured over 9,497 settled battles. The draw price has to match the band
// that settles it: the contract's DRAW_THRESHOLD_BPS is a deployed constant,
// so these rates are a fact about the game, not a dial.
//
// 1D had no settled battles in the sample and falls back to the 4h rate. That
// overstates draw probability for a longer window, which errs toward the house
// rather than against it. Re-measure once 1D battles have settled.
//
// If BATTLE_PAIRS ever moves a pair between durations, these need re-measuring:
// the buckets differ by coin mix as well as by time (30m is memecoins, 4h is
// majors), so some of the spread is volatility, not duration.
export const DRAW_RATE = {
  '30m': 0.248,
  '1h': 0.297,
  '4h': 0.179,
}
export const DEFAULT_DRAW_RATE = 0.179'''

PROBS_NEW = '''  // The draw is priced at the rate the settlement band actually produces, and
  // A/B split whatever is left. The old flat 0.20 against a true ~26% gave draw
  // backers an edge and overheld on A/B; worse, it was paired with a Solana
  // threshold of 0 that made the leg unwinnable on that chain entirely.
  const drawRate = DRAW_RATE[duration] || DEFAULT_DRAW_RATE
  const side = (1 - drawRate) / 2
  const probA = Math.max(0.10, Math.min(0.80, side + totalEdge))
  const probB = Math.max(0.10, Math.min(0.80, side - totalEdge))
  const probDraw = drawRate
  const t = probA + probB + probDraw
  return { probA: probA / t, probB: probB / t, probDraw: probDraw / t }'''

EDITS = [
  ("lib/oddsEngine.mjs", [
    ("server draw rates", "export const MOMENTUM_WEIGHT = 0", DRAW_RATE_BLOCK),

    ("server prior signature",
     "export function getStartingProbs(coinA, coinB, changeA, changeB) {",
     "export function getStartingProbs(coinA, coinB, changeA, changeB, duration) {"),

    ("server probs",
     "  const probA = Math.max(0.10, Math.min(0.80, 0.40 + totalEdge))\n"
     "  const probB = Math.max(0.10, Math.min(0.80, 0.40 - totalEdge))\n"
     "  const probDraw = Math.max(0.05, 0.20 - Math.abs(totalEdge) * 0.08)\n"
     "  const t = probA + probB + probDraw\n"
     "  return { probA: probA / t, probB: probB / t, probDraw: probDraw / t }",
     PROBS_NEW),
  ]),

  ("api/cron.mjs", [
    ("cron passes duration",
     "    const baseProbs = getStartingProbs(\n"
     "      pair.coinA, pair.coinB,\n"
     "      momentum[pair.coinA] || 0,\n"
     "      momentum[pair.coinB] || 0,\n"
     "    )",
     "    const baseProbs = getStartingProbs(\n"
     "      pair.coinA, pair.coinB,\n"
     "      momentum[pair.coinA] || 0,\n"
     "      momentum[pair.coinB] || 0,\n"
     "      pair.duration,\n"
     "    )"),
  ]),

  ("lib/settlement.mjs", [
    ("solana draw threshold",
     "const DRAW_THRESHOLD = 0 // exact tie only; any measurable move picks a winner",
     "// MUST match DRAW_THRESHOLD_BPS in PredArena.sol (10 bps = 0.1% = 0.001).\n"
     "// One battles row serves both chains but each grades it separately, so any\n"
     "// difference here shows up as a user being paid one result and shown\n"
     "// another. At 0 this disagreed with the contract on 25.6% of battles.\n"
     "// The contract's constant cannot be changed without a redeploy, so this is\n"
     "// the side that moves.\n"
     "const DRAW_THRESHOLD = 0.001"),
  ]),

  ("api/arc-keeper.mjs", [
    ("arc twap anchor",
     "      const twapCutoff = new Date(Date.now() - 90 * 1000).toISOString()\n"
     "      const [twapA, twapB] = await Promise.all([\n"
     "        supabase.from('price_history').select('price').eq('coin', b.coin_a)\n"
     "          .gte('recorded_at', twapCutoff).order('recorded_at', { ascending: false }).limit(10),\n"
     "        supabase.from('price_history').select('price').eq('coin', b.coin_b)\n"
     "          .gte('recorded_at', twapCutoff).order('recorded_at', { ascending: false }).limit(10),\n"
     "      ])",
     "      // Anchored to the battle's END, matching lib/settlement.mjs. Anchoring\n"
     "      // to Date.now() meant the window moved with whenever the keeper\n"
     "      // happened to run - up to two minutes after the battle ended - so the\n"
     "      // two chains could read different prices for the same battle and\n"
     "      // disagree on the winner from timing alone.\n"
     "      const twapFrom = new Date(new Date(b.end_time).getTime() - 90 * 1000).toISOString()\n"
     "      const twapTo = new Date(b.end_time).toISOString()\n"
     "      const [twapA, twapB] = await Promise.all([\n"
     "        supabase.from('price_history').select('price').eq('coin', b.coin_a)\n"
     "          .gte('recorded_at', twapFrom).lte('recorded_at', twapTo)\n"
     "          .order('recorded_at', { ascending: false }).limit(10),\n"
     "        supabase.from('price_history').select('price').eq('coin', b.coin_b)\n"
     "          .gte('recorded_at', twapFrom).lte('recorded_at', twapTo)\n"
     "          .order('recorded_at', { ascending: false }).limit(10),\n"
     "      ])"),
  ]),

  ("src/services/oddsEngine.ts", [
    ("client draw rates",
     "const MOMENTUM_WEIGHT = 0",
     "const MOMENTUM_WEIGHT = 0\n"
     "\n"
     "// Mirror of lib/oddsEngine.mjs. Only reached as a fallback for rows with no\n"
     "// base_prob_*, but a fallback that disagrees with the server is how the\n"
     "// requote loop started.\n"
     "const DRAW_RATE: Record<string, number> = {\n"
     "  '30m': 0.248,\n"
     "  '1h': 0.297,\n"
     "  '4h': 0.179,\n"
     "}\n"
     "const DEFAULT_DRAW_RATE = 0.179"),

    ("client prior signature",
     "export async function getStartingOdds(coinA: string, coinB: string): Promise<OddsResult> {",
     "export async function getStartingOdds(coinA: string, coinB: string, duration?: string): Promise<OddsResult> {"),

    ("client draw prob",
     "  const probDraw = Math.max(0.05, 0.20 - Math.abs(totalEdge) * 0.08)",
     "  const drawRate = (duration && DRAW_RATE[duration]) || DEFAULT_DRAW_RATE\n"
     "  const probDraw = drawRate"),
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
    print("Both chains now grade on the same 0.1% band and read the same price")
    print("window. New battles price the draw at its measured rate.")
    print("")
    print("WHAT CHANGES FOR USERS. Draws go from ~0% to ~26% of Solana battles.")
    print("That is not a regression, it is the rule they were already being")
    print("charged for, but it will feel like one to anyone used to the old")
    print("behaviour. Worth saying out loud wherever you announce things.")
    print("")
    print("STILL TO DO BY HAND: 6 Arc tickets were graded against the old")
    print("mismatched rule and are wrong in History and on the leaderboard.")
    print("Battles already settled keep the winner they were given; only new")
    print("ones are affected by this patch.")


if __name__ == "__main__":
    main()
