"""
URGENT FIRST, then two additions.

1. REMOVES THE HOUSE EDGE BLOCK, which is live on production right now.

You asked for it to be cut. The deploy published it anyway: "the book is priced
at a 1.30 overround ... a fair price would be about 2.44; you are offered 1.88"
is on https://predarena-app.vercel.app/how-to-play as of this patch being
written. Cause: commit 5777c1e ran the FIRST version of patch_how_to_play.py -
the one saved before you decided - while carrying the commit message from the
second. The same stale file is why the PriceChartModal fix never landed and why
that commit message claims a change it does not contain.

Nothing here is a disaster: the number is true and the page is honest. But it
is your call, you made it, and the deploy went the other way. This puts it back
where you asked.

2. FIXES PriceChartModal FOR REAL. "Updates every 5 min" is still there. The
cron writes price_history every 60 seconds. Second attempt at the same one-line
fix.

3. ADDS THE REFERRAL SECTION, now that the number is verified rather than
guessed. From credit_referrer_for_loss:

    v_credit_usd := round(p_loss_usd * 0.02, 6)

2% of each loss by someone you invited, credited to your balance, once per
settled losing ticket, nothing on their wins.

WHAT THE RULES PAGE DELIBERATELY STILL DOES NOT SAY, and why:

  - "Referral points." The same function writes referral_points.points =
    floor(loss_usd), which Stats renders as POINTS. The leaderboard renders a
    completely different quantity under the same word. Documenting both would
    cement a contradiction into the rules. Fix the collision first (step 4),
    then document whichever survives.

  - Which wallet the credit lands in. The function picks
      select address from profile_wallets where profile_id = ...
      order by is_primary desc limit 1
    with NO chain filter, then credits lamports to it. For a profile whose
    primary wallet is an Arc/EVM address that looks wrong, but I have not read
    credit_balance and will not describe behaviour I have not verified. See the
    note in the chat message - worth checking before anyone relies on it.

Safe by construction: every anchor verified to occur EXACTLY ONCE before
anything is written. Backs each file up to .bak.

Run from repo root:  python3 migrations/patch_rules_followup.py
"""
import sys, os, shutil

PATH = "src/PredaLandingDashboardMockup.tsx"
MODAL = "src/components/PriceChartModal.tsx"

HOUSE_OLD = '''      {/* ---- HOUSE EDGE ---------------------------------------------------
          Delete this block if you would rather not publish the number. It is
          here because every other rule on this page is disclosed, and a rules
          page that is candid about everything except what it charges you reads
          worse than one that says nothing at all. */}
      <RuleBlock title="What the house takes">
        <p>
          The three prices on a battle are set to total more than 100% of the
          implied chances &mdash; the book is priced at a <strong>1.30 overround</strong>.
          On an even match where each coin is a true 41% chance, a fair price
          would be about 2.44; you are offered 1.88.
        </p>
        <p className="mt-3">
          That is the margin, and it is the same on every battle. Nothing is taken
          from a winning payout on top of it.
        </p>
      </RuleBlock>'''

HOUSE_NEW = '''      <RuleBlock title="Inviting other players">
        <p>
          Invite someone with your referral link and you earn <strong>2%</strong>{" "}
          of every losing bet they settle, credited straight to your balance. You
          earn nothing from their winning bets, and each of their tickets credits
          you once.
        </p>
      </RuleBlock>

      {/* The exact house edge is deliberately not published, by the operator's
          decision. What is said below is true and checkable and nothing here
          misstates it. For whoever maintains this next: the figure is a 1.30
          overround, which on an even match turns a fair 2.44 into the 1.88 on
          screen. Publish it or do not, but do not let this page imply the
          margin is smaller than it is. */}
      <RuleBlock title="How the prices are set">
        <p>
          The three prices on a battle add up to more than 100% of the implied
          chances. That difference is the house margin. It is the same on every
          battle, and nothing further is deducted from a winning payout.
        </p>
      </RuleBlock>'''

EDITS = [
  (MODAL, [
    ("stale cadence in chart modal",
     "% change from battle start \u00b7 Updates every 5 min \u00b7 Settled via Pyth Network",
     "% change from battle start \u00b7 Updates every minute \u00b7 Settled via Pyth Network"),
  ]),

  (PATH, [
    ("remove house edge, add referrals", HOUSE_OLD, HOUSE_NEW),
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
        print("")
        print("If the house edge anchor is missing, check whether the block is")
        print("already gone from src/PredaLandingDashboardMockup.tsx - it may")
        print("have been removed by hand, in which case only the modal fix and")
        print("the referral section are still needed.")
        sys.exit(1)

    for path, edits in EDITS:
        shutil.copy(path, path + ".bak")
        s = contents[path]
        for _, anchor, repl in edits:
            s = s.replace(anchor, repl, 1)
        open(path, "w").write(s)
        print("Patched %s (backup at %s.bak)" % (path, path))

    print("")
    print("HOUSE EDGE BLOCK REMOVED. It was live on production. The page now")
    print("says a margin exists and that nothing further is taken from a payout,")
    print("without the 1.30 figure or the worked example.")
    print("")
    print("REFERRALS ADDED: 2% of each losing bet by someone you invited,")
    print("verified against credit_referrer_for_loss, not remembered.")
    print("")
    print("PriceChartModal cadence fixed - second attempt; the first never")
    print("landed because commit 5777c1e ran the earlier version of the script.")
    print("")
    print("VERIFY AFTER DEPLOY, do not take my word for it:")
    print("  curl -s https://predarena-app.vercel.app/ | grep -o 'main\\.[a-f0-9]*\\.js'")
    print("  then fetch that bundle and confirm '1.30 overround' is absent.")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
