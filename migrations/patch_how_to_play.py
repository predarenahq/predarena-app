"""
Replaces the one-sentence How to Play placeholder with the actual rules.

WHY THIS MATTERS NOW. Betting is open again as of today. Five things decide
whether a user wins money and, until this patch, none of them were written
anywhere in the product:

  - a gap of 0.1% or less is a DRAW, not a win for the leader
  - betting closes at 80% of the duration, not at the end
  - settlement is a 90s TWAP anchored to the end time, not a spot print
  - Solana stakes sit in a custodial vault; Arc stakes sit in a contract
  - the prices carry a house margin

Every fixed-odds operator publishes these, because the first disputed
settlement is won or lost on whether the rule was written down beforehand.
Right now a user who loses on a 0.09% gap has no page to be pointed at, and
they are right to be annoyed. The draw change makes it urgent rather than
tidy: draws went from near-never to roughly a quarter of battles when the
Solana threshold was corrected to match the contract.

EVERY NUMBER HERE WAS READ OUT OF THE CODE, NOT REMEMBERED:
  lib/oddsEngine.mjs   HOUSE_MARGIN 1.30, MIN_ODDS 1.10, MAX_SINGLE_ODDS 30.0,
                       MAX_COMBO_ODDS 100.0, BETTING_LOCK_AT 0.80,
                       DRAW_RATE {30m .248, 1h .297, 4h .179},
                       getImbalanceAdjustment (>60% share, capped at 0.15),
                       compressOdds (leader decays toward 1.01)
  lib/settlement.mjs   DRAW_THRESHOLD 0.001, 90s window anchored to end_time
  api/place-bet.mjs    devnet RPC          api/arc-*.mjs  arc-testnet

ONE THING LEFT OUT ON PURPOSE: the referral rate. The share a referrer earns
of a referred user's losses lives inside the credit_referrer_for_loss RPC,
which is in Postgres, not this repo. I will not publish a percentage I have
not read. Tell me the number and I will add the line.

THE HOUSE EDGE IS NOT PUBLISHED, by the operator's decision. The page says
the prices carry a margin and that nothing further is deducted from a payout -
both true, both checkable - but does not give the 1.30 figure. Recorded here so
nobody later mistakes the omission for an oversight: it was asked and answered.

Safe by construction: every anchor verified to occur EXACTLY ONCE before
anything is written. Backs each file up to .bak.

Run from repo root:  python3 migrations/patch_how_to_play.py
"""
import sys, os, shutil

PATH = "src/PredaLandingDashboardMockup.tsx"
MODAL = "src/components/PriceChartModal.tsx"

COMPONENT = '''/**
 * The rules. Betting is open, so these have to be published somewhere a user
 * can be pointed at when they dispute a settlement - which, in a fixed-odds
 * book, is the whole reason a rules page exists.
 *
 * Every figure here is read from lib/oddsEngine.mjs and lib/settlement.mjs. If
 * you change a constant there, change it here in the same commit, or this page
 * becomes the most expensive kind of documentation: the confident wrong kind.
 */
function RuleBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
        {title}
      </h3>
      <div className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "var(--text-soft)" }}>
        {children}
      </div>
    </section>
  );
}

function HowToPlayPage() {
  const cell = "px-3 py-2 text-left";
  return (
    <div
      className="rounded-[24px] bg-[var(--panel)] p-6 sm:p-8"
      style={{ boxShadow: "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(20,20,30,0.05)" }}
    >
      <h2 className="font-display text-[30px]" style={{ color: "var(--text)" }}>How to Play</h2>

      <div
        className="mt-4 rounded-[14px] px-4 py-3 text-sm font-medium"
        style={{ background: "var(--accent-soft)", color: "var(--text)" }}
      >
        PredArena runs on Solana devnet and Arc testnet. Every balance, stake and
        payout is test currency with no monetary value.
      </div>

      <RuleBlock title="The bet">
        <p>
          Two coins are matched for a fixed window. Whichever moves further in
          percentage terms from its starting price wins &mdash; the direction does not
          matter, only the relative move. A coin that falls 2% beats a coin that
          falls 5%.
        </p>
        <p className="mt-3">
          Three outcomes: the first coin, the second coin, or a draw.
        </p>
      </RuleBlock>

      <RuleBlock title="The draw is not a technicality">
        <p>
          If the two coins finish within <strong>0.1%</strong> of each other, the
          battle is a draw. Backing the leader loses. This band is fixed in the
          settlement contract and cannot be changed per battle.
        </p>
        <p className="mt-3">
          A 0.1% band sounds narrow, but over 9,497 settled battles it produced
          draws this often:
        </p>
        <div className="mt-3 overflow-hidden rounded-[12px] border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ background: "var(--panel-2)", color: "var(--text-muted)" }}>
                <th className={cell + " font-semibold"}>Battle length</th>
                <th className={cell + " font-semibold"}>Ended in a draw</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--text-2)" }}>
              <tr><td className={cell}>30 minutes</td><td className={cell}>24.8%</td></tr>
              <tr><td className={cell}>1 hour</td><td className={cell}>29.7%</td></tr>
              <tr><td className={cell}>4 hours</td><td className={cell}>17.9%</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Roughly one battle in four. Price the draw accordingly.
        </p>
      </RuleBlock>

      <RuleBlock title="Betting closes before the battle ends">
        <p>
          The book shuts at <strong>80% of the duration</strong>, not at the final
          whistle. A 1-hour battle stops taking bets at 48 minutes; a 4-hour
          battle at 3 hours 12 minutes. The last fifth runs with the book closed.
        </p>
      </RuleBlock>

      <RuleBlock title="How a battle is settled">
        <p>
          Prices come from the Pyth oracle. At the battle&rsquo;s end time we take
          every price recorded in the final <strong>90 seconds</strong> and average
          them, rather than reading a single instant &mdash; a one-tick spike cannot
          decide a battle. If no price was recorded in that window, a single live
          price is used instead.
        </p>
        <p className="mt-3">
          The same prices settle both chains, so a battle cannot pay one result on
          Solana and another on Arc.
        </p>
      </RuleBlock>

      <RuleBlock title="Your odds are locked when you bet">
        <p>
          The price you accept is the price you are paid at. The displayed line
          keeps moving after you bet, but your ticket does not change.
        </p>
        <p className="mt-3">Three things move the line while a battle runs:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>The scoreline.</strong> As one coin pulls ahead, its price
            shortens and the other lengthens.
          </li>
          <li>
            <strong>Time.</strong> The leader&rsquo;s odds decay toward 1.01 as the
            clock runs down, and the draw lengthens as the gap widens.
          </li>
          <li>
            <strong>Where the money is.</strong> Once a battle has more than $50
            matched, a side holding over 60% of the two-way pool has its price
            shortened. The adjustment is capped, so it nudges the line rather than
            setting it.
          </li>
        </ul>
      </RuleBlock>

      <RuleBlock title="Limits">
        <p>
          No price is shorter than <strong>1.10</strong> or longer than{" "}
          <strong>30.00</strong> on a single. A parlay pays at most{" "}
          <strong>100.00</strong>, however many legs it has. A winning ticket priced
          above those caps is paid at the cap.
        </p>
      </RuleBlock>

      <RuleBlock title="Parlays">
        <p>
          Combine legs across battles and the odds multiply. Every leg must win &mdash;
          one loss voids the ticket. If a leg&rsquo;s battle is voided, the whole
          parlay is refunded rather than being settled on the remaining legs.
        </p>
      </RuleBlock>

      <RuleBlock title="Voids and refunds">
        <p>
          If a battle cannot be settled fairly it is voided and every stake on it
          is returned in full. Voided battles do not count as a win or a loss in
          your record.
        </p>
      </RuleBlock>

      <RuleBlock title="Where your stake sits">
        <p>
          <strong>Solana.</strong> Stakes are held in a custodial vault operated by
          PredArena. Your balance is a claim on that vault, not coins in your own
          wallet &mdash; you are trusting the operator to honour it.
        </p>
        <p className="mt-3">
          <strong>Arc.</strong> Stakes are held by the PredArena contract on-chain.
          Settlement and payout are executed by the contract.
        </p>
      </RuleBlock>

      {/* The exact house edge is deliberately not published here, by the
          operator's decision. What IS said below is true and checkable, and
          nothing here misstates it. If you publish the number later it is a
          1.30 overround, which on an even match turns a fair 2.44 into the
          1.88 on screen. */}
      <RuleBlock title="How the prices are set">
        <p>
          The three prices on a battle add up to more than 100% of the implied
          chances. That difference is the house margin. It is the same on every
          battle, and nothing further is deducted from a winning payout.
        </p>
      </RuleBlock>

      <p className="mt-10 text-xs" style={{ color: "var(--text-muted)" }}>
        These rules describe the system as deployed. Where this page and the
        settlement contract disagree, the contract decides.
      </p>
    </div>
  );
}

'''

EDITS = [
  (MODAL, [
    # The battle page's caption was corrected in patch_twap_threshold, but a
    # SECOND copy of the same false claim lives in the chart modal. The cron
    # writes price_history every 60 seconds, not every 5 minutes. Same lie,
    # different component - fixed here because it is the same class of problem
    # as the rest of this patch: telling bettors something untrue about how
    # settlement works.
    ("stale cadence in chart modal",
     "% change from battle start \u00b7 Updates every 5 min \u00b7 Settled via Pyth Network",
     "% change from battle start \u00b7 Updates every minute \u00b7 Settled via Pyth Network"),
  ]),

  (PATH, [
  ("how to play component",
   "function PlaceholderPage({",
   COMPONENT + "function PlaceholderPage({"),

  ("how to play route",
   '      case "/how-to-play":\n'
   '        return <PlaceholderPage title="How to Play" body="Pick left, draw, or right. Build parlays. Relative performance over the selected period decides the winner." />;',
   '      case "/how-to-play":\n'
   '        return <HowToPlayPage />;'),
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
    print("/how-to-play now publishes the actual rules: the 0.1% draw band with")
    print("its measured rates, the 80% betting lock, the 90s TWAP, odds locking")
    print("at placement, what moves the line, the caps, parlays, voids and")
    print("custody on each chain.")
    print("")
    print("The house edge figure is NOT published, by your decision. The page")
    print("says a margin exists and that nothing further is taken from a payout.")
    print("")
    print("Also fixed the SECOND stale 'Updates every 5 min' string, in")
    print("PriceChartModal. The cron writes prices every 60 seconds.")
    print("")
    print("LEFT OUT: the referral rate. It lives in the credit_referrer_for_loss")
    print("RPC in Postgres, not this repo, and I will not publish a number I have")
    print("not read. Send it and I will add the line.")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
