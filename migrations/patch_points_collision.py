"""
Ends the "points" collision, and tells the truth about how referrals pay.

THE COLLISION. Two unrelated numbers share one word, both visible to the same
user in the same session:

  ProfilePage  "Points"  = referral_points.points
                         = sum of floor(loss_usd) over the losing tickets of
                           people you invited. One point per dollar THEY LOSE.

  Leaderboard  "Points"  = round(staked/100 + greatest(profit,0)/10
                                 + active_referrals, 2)
                         = your own volume and profit, plus a head count.

A user who sees POINTS 0 on their profile and 4.2 beside their name on the
leaderboard has no way to know these are different quantities. The leaderboard
already explains its formula on the page, so it keeps the bare word; the
profile card is the one that has to be specific.

THE SECOND LIE, same panel. The intro reads "Earn USDC and points when the
people you invite play." You do not earn when they play. You earn when they
LOSE - 2% of each losing bet, per credit_referrer_for_loss. The rules page now
states that plainly, so this panel contradicting it is worse than it was
yesterday.

NOT RENAMING THE LEADERBOARD COLUMN, deliberately. "Points" there is the
headline ranking metric and the page carries its own one-line definition
directly above the table. Making it "Leaderboard Points" inside the leaderboard
would be noise.

SHIPS WITH A SQL MIGRATION - migrations/fix_referral_payout.sql. Apply both or
neither; they describe the same mechanism to the user and to the database.

Safe by construction: both anchors verified to occur EXACTLY ONCE before
anything is written. Backs the file up to .bak.

Run from repo root:  python3 migrations/patch_points_collision.py
"""
import sys, os, shutil

PATH = "src/PredaLandingDashboardMockup.tsx"

EDITS = [
  ("points card label",
   '          <InfoCard label="Points" value={String(refStats?.points ?? 0)} />',
   '          {/* Named specifically because the Leaderboard shows a DIFFERENT\n'
   '              quantity under the bare word "Points": volume/100 + profit/10\n'
   '              + referral count. This one is floor(loss_usd) summed over the\n'
   '              losing tickets of people you invited. Two numbers, one word,\n'
   '              both on screen for the same user. */}\n'
   '          <InfoCard\n'
   '            label="Referral Points"\n'
   '            value={String(refStats?.points ?? 0)}\n'
   '            sub="1 per $1 lost by players you invited"\n'
   '          />'),

  ("referral panel intro",
   "Share your link. Earn USDC and points when the people you invite play.",
   "Share your link. You earn 2% of every bet the people you invite lose."),
]


def main():
    if not os.path.exists(PATH):
        print("ERROR: %s not found. Run from repo root." % PATH)
        sys.exit(1)
    s = open(PATH).read()

    problems = []
    for label, anchor, _ in EDITS:
        n = s.count(anchor)
        if n != 1:
            problems.append("  [%s] anchor found %d times (expected 1)" % (label, n))
    if problems:
        print("ABORTED - nothing written. Anchor mismatch:")
        print("\n".join(problems))
        sys.exit(1)

    shutil.copy(PATH, PATH + ".bak")
    for _, anchor, repl in EDITS:
        s = s.replace(anchor, repl, 1)
    open(PATH, "w").write(s)
    print("Patched %s (backup at %s.bak)" % (PATH, PATH))
    print("")
    print("The profile card is now 'Referral Points' with its own definition,")
    print("so it no longer collides with the Leaderboard's 'Points'. The panel")
    print("intro says you earn when invitees LOSE, matching the rules page and")
    print("matching what credit_referrer_for_loss actually does.")
    print("")
    print("APPLY migrations/fix_referral_payout.sql TOO. Same mechanism, other")
    print("half: the payout wallet selection picks the wrong wallet today.")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
