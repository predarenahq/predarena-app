"""
Makes settlement deterministic again, and stops two labels misleading bettors.

PART 1 - THE TWAP THRESHOLD. The heartbeat told us something nobody knew: the
cron runs every 60 seconds (14:27:04, 14:28:04, 14:29:05). Both settlement
paths average price_history over a 90-SECOND window and require 2 rows:

  lib/settlement.mjs   if (data && data.length >= 2)        else live price
  api/arc-keeper.mjs   twapA.data?.length >= 2 ? avg : livePrices[...]

A 90-second window at a 60-second cadence holds ONE row or TWO, depending
purely on where the battle's end time falls between ticks. So roughly half of
all battles TWAP and half fall through to a live spot price.

That fallback is the problem. patch_draw_align anchored both chains to the
battle's end_time, so when both find 2 rows they average the identical rows and
agree. When only 1 row is in the window, each chain instead fetches its own
live price at whatever moment its own job happens to run - and the cross-chain
divergence we just spent a morning closing reopens on those battles.

The fix is one character per site: >= 2 becomes >= 1. A price RECORDED AT THE
BATTLE'S END is strictly better evidence than a spot price fetched minutes
later, and it makes both chains read the same rows every time. Zero rows still
falls back to live, which is the correct safety net.

NOT CHANGING THE WINDOW. Widening 90s to ~5 minutes would give a smoother
average, but on a 30m battle that is a sixth of the whole contest being
smoothed, which changes the economics for existing bettors. Worth deciding
separately, with data, not folded into a correctness fix.

PART 2 - TWO LABELS. Both on the battle page, both now live with betting open.

  a) "Updates every 5 min" under the chart. It updates every 60 seconds.
  b) The middle card reads  Leading / ETH / +0.9662%  while the card beside it
     reads  ETH / +1.4295%. Two different ETH numbers on one screen. The middle
     one is the MARGIN (1.4295 - 0.4633), and nothing says so. "ahead by" is
     the whole fix.

  (A correction to my earlier write-up: I said the middle card carried the same
  "since battle start" caption as the two beside it. It does not - it has no
  caption at all. The ambiguity is real, the detail I gave was wrong.)

Safe by construction: every anchor verified to occur EXACTLY ONCE before
anything is written. Backs each file up to .bak.

Run from repo root:  python3 migrations/patch_twap_threshold.py
"""
import sys, os, shutil

TWAP_NOTE = '''  // >= 1, not >= 2. The cron writes price_history every 60 seconds, so this
  // 90-second window holds one row or two depending purely on where end_time
  // falls between ticks. Requiring two meant roughly half of all battles fell
  // through to a live spot price fetched at whatever moment the job ran - and
  // because Solana and the Arc keeper run at different moments, that reopened
  // the cross-chain divergence patch_draw_align closed. A price recorded AT
  // the battle's end beats a spot price fetched minutes after it. Zero rows
  // still falls back to live, which is the right safety net.
  if (data && data.length >= 1) {'''

EDITS = [
  ("lib/settlement.mjs", [
    ("solana twap threshold",
     "  if (data && data.length >= 2) {",
     TWAP_NOTE),
  ]),

  ("api/arc-keeper.mjs", [
    ("arc twap threshold A",
     "      const finalPriceA = twapA.data?.length >= 2",
     "      // >= 1 to match lib/settlement.mjs. At a 60s cron cadence a 90s\n"
     "      // window holds 1 or 2 rows, and requiring 2 sent half of all\n"
     "      // battles to a live price fetched at this keeper's own run time -\n"
     "      // a different moment from the Solana settler, which is exactly the\n"
     "      // divergence the end_time anchor was meant to remove.\n"
     "      const finalPriceA = twapA.data?.length >= 1"),

    ("arc twap threshold B",
     "      const finalPriceB = twapB.data?.length >= 2",
     "      const finalPriceB = twapB.data?.length >= 1"),
  ]),

  ("src/BattleDetailPage.tsx", [
    ("chart cadence caption",
     "% change from battle start · Updates every 5 min · Settlement decided by Pyth oracle prices",
     "% change from battle start · Updates every minute · Settlement decided by Pyth oracle prices"),

    ("leading margin label",
     "                  +{Math.abs(latestA - latestB).toFixed(4)}%",
     "                  {/* This is the MARGIN between the two coins, not the\n"
     "                      leader's own move - the card beside it already shows\n"
     "                      that, and a bare percentage here read as a second,\n"
     "                      contradictory figure for the same coin. */}\n"
     "                  ahead by {Math.abs(latestA - latestB).toFixed(4)}%"),
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
    print("Both chains now settle from the same recorded rows whenever the")
    print("window has any data at all, instead of racing to their own live")
    print("prices on roughly half of battles.")
    print("")
    print("STILL OPEN, deliberately not in this patch:")
    print("  - the 90s window itself. Widening it smooths the average but")
    print("    changes settlement economics on short battles. Decide with data.")
    print("  - battles_created / battles_settled in cron_runs are success")
    print("    flags set to 1, not counts, so the heartbeat cannot tell you")
    print("    HOW MANY settled. Fixing needs settleBattles to return a count.")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
