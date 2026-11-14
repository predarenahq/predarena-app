"""
Builds the Leaderboard page and wires it to the /leaderboard route.

The route, the sidebar entry (PRODUCT > Leaderboard) and the section map already
exist - /leaderboard has been rendering PlaceholderPage this whole time. So this
only does two things: adds the LeaderboardPage component, and swaps the
placeholder for it. No nav changes, desktop or mobile.

Reads /api/content?type=leaderboard, which returns BOTH windows in one response
({ week_start, weekly, all_time }), so the toggle is client-side with no second
fetch. That endpoint is the uncommitted content.mjs change on your tree - it has
to go out in the SAME push as this, or the page fetches a 400.

Ranked by profit, top 20 per window, settled bets only. Combos count once (the
RPC collapses them by combo id). Players who are down show with a negative
figure rather than being hidden - a leaderboard that only shows winners tells
you nothing about the game. A profile with no username renders as "Anonymous"
and is not clickable; everyone else links to their public profile.

Safe by construction: both anchors verified to occur EXACTLY ONCE before
anything is written. Backs up to .bak.

Run from repo root:  python3 migrations/patch_leaderboard_page.py
"""
import sys, os, shutil

PATH = "src/PredaLandingDashboardMockup.tsx"

COMPONENT = '''type LeaderRow = {
  username: string | null;
  avatar_url: string | null;
  settled: number;
  wins: number;
  staked: number;
  profit: number;
};

/**
 * Profit leaderboard, weekly and all-time.
 *
 * Both windows arrive in one response so the toggle costs nothing. Profit is
 * computed server-side in the `leaderboard` RPC from settled tickets, with
 * combos collapsed to one entry each - counting combo legs as separate bets is
 * the same trap that once rendered one 4-leg bet as four cards in History and
 * would inflate both staked and profit here.
 */
function LeaderboardPage() {
  const navigate = useNavigate();
  const [range, setRange] = React.useState<"weekly" | "all_time">("weekly");
  const [data, setData] = React.useState<{ week_start: string; weekly: LeaderRow[]; all_time: LeaderRow[] } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content?type=leaderboard");
        if (!res.ok) throw new Error("leaderboard " + res.status);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows: LeaderRow[] = (range === "weekly" ? data?.weekly : data?.all_time) || [];
  const money = (n: number) => (n < 0 ? "-" : "+") + "$" + Math.abs(n).toFixed(2);
  const weekStart = data?.week_start
    ? new Date(data.week_start).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  return (
    <section className="overflow-hidden rounded-[24px] border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
      <div className="px-5 pt-6 sm:px-6">
        <h2 className="font-display text-[32px]" style={{ color: "var(--text)" }}>Leaderboard</h2>
        <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-soft)" }}>
          Ranked by profit. Settled bets only, so a running bet joins the board once it lands.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {([["weekly", "This week"], ["all_time", "All time"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-sm font-medium transition-all active:scale-[0.98]"
              style={range === key
                ? { background: "var(--text)", color: "var(--panel)" }
                : { border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-2)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {range === "weekly" && weekStart && (
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>Since Monday {weekStart}</p>
        )}
      </div>

      <div className="px-5 py-6 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: "var(--text-soft)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leaderboard...
          </div>
        ) : failed ? (
          <div className="rounded-[20px] border border-dashed p-8 text-center" style={{ borderColor: "var(--border)" }}>
            <p className="text-lg font-bold" style={{ color: "var(--text)" }}>The leaderboard did not load.</p>
            <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-soft)" }}>Refresh in a moment.</p>
          </div>
        ) : !rows.length ? (
          <div className="rounded-[20px] border border-dashed p-8 text-center" style={{ borderColor: "var(--border)" }}>
            <p className="text-lg font-bold" style={{ color: "var(--text)" }}>
              {range === "weekly" ? "Nothing has settled yet this week." : "No settled bets yet."}
            </p>
            <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-soft)" }}>
              {range === "weekly"
                ? "The board fills as this week's battles settle."
                : "Place a bet on the Arena to get on the board."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const rank = i + 1;
              const name = r.username || "Anonymous";
              const winRate = r.settled ? Math.round((r.wins / r.settled) * 100) + "% won" : "no result yet";
              const profit = Number(r.profit);
              return (
                <div
                  key={(r.username || "anon") + "-" + i}
                  onClick={() => { if (r.username) navigate("/u/" + r.username); }}
                  className="flex items-center gap-3 rounded-[14px] px-3 py-3 transition-colors sm:px-4"
                  style={{
                    background: "var(--panel-2)",
                    border: "1px solid var(--border-soft)",
                    cursor: r.username ? "pointer" : "default",
                  }}
                >
                  <span
                    className="w-7 shrink-0 text-center text-[13px] font-bold"
                    style={{ color: rank <= 3 ? "var(--accent)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {rank}
                  </span>

                  <Avatar seed={r.username} size={34} uploadedUrl={r.avatar_url} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{name}</p>
                    <p className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {r.settled} settled<span className="hidden sm:inline"> · {winRate}</span>
                    </p>
                  </div>

                  <div className="hidden text-right sm:block">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Staked</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                      ${Number(r.staked).toFixed(2)}
                    </p>
                  </div>

                  <div className="w-[78px] shrink-0 text-right sm:w-[96px]">
                    <p className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] sm:block" style={{ color: "var(--text-muted)" }}>Profit</p>
                    <p
                      className="text-[15px] font-semibold"
                      style={{
                        color: profit > 0 ? "var(--pos)" : profit < 0 ? "var(--neg)" : "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {money(profit)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

'''

EDITS = [
  ("leaderboard component",
   "function SettingsPage() {",
   COMPONENT + "function SettingsPage() {"),

  ("leaderboard route",
   '      case "/leaderboard":\n'
   '        return <PlaceholderPage title="Leaderboard" body="Top users, biggest wins, active streaks, and most consistent performers will show here." />;',
   '      case "/leaderboard":\n'
   '        return <LeaderboardPage />;'),
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
    print("The /leaderboard route now renders the real page. The sidebar entry")
    print("under PRODUCT already pointed here, so there is nothing to add to the")
    print("nav on either desktop or mobile.")
    print("")
    print("This needs the content.mjs ?type=leaderboard branch in the SAME push,")
    print("or the page fetches a 400. Check it is still on your tree:")
    print("  grep -c \"type === 'leaderboard'\" api/content.mjs")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
