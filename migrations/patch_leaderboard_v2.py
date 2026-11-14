"""
Leaderboard v2: adds volume, referrals and a points ranking, and widens the
board to the top 100.

Points, computed server-side in the `leaderboard` RPC:

    volume / 100  +  max(profit, 0) / 10  +  active referrals

An "active referral" is someone you invited who has settled a bet. A signup on
its own is worth nothing, so the count cannot be farmed with empty accounts.

ON LOSSES. A literal reading of "1 point per $10 profit" turns -$311 into -31
points, which ranks someone who played and lost BELOW someone who never placed
a bet - and that fights the reason volume is in the formula. So a loss earns no
profit points but keeps the volume and referral points already earned. The
clamp is max(profit, 0) in the RPC; drop the max() there to let losses subtract.

Replaces the whole v1 LeaderboardPage by span: everything from `type LeaderRow`
up to `function SettingsPage() {`. Both markers must appear exactly once and in
that order, or this aborts without writing.

Needs the matching `leaderboard` RPC (referrals + points, limit 100) and the
content.mjs branch in the SAME push, or the new columns render undefined.

Run from repo root:  python3 migrations/patch_leaderboard_v2.py
"""
import sys, os, shutil

PATH = "src/PredaLandingDashboardMockup.tsx"

START = "type LeaderRow = {"
END = "function SettingsPage() {"

NEW = """\
type LeaderRow = {
  username: string | null;
  avatar_url: string | null;
  settled: number;
  wins: number;
  staked: number;
  profit: number;
  referrals: number;
  points: number;
};

/**
 * Points leaderboard, weekly and all-time, top 100.
 *
 * Points are computed server-side in the `leaderboard` RPC:
 *   volume / 100  +  max(profit, 0) / 10  +  active referrals
 * A referral counts once the person you invited has settled a bet, so a dead
 * invite is worth nothing.
 *
 * A LOSS earns no profit points but does not burn the volume and referral
 * points already earned. Letting profit go negative would rank someone who
 * played and lost below someone who never placed a bet, which defeats the
 * reason volume is in the formula. The clamp lives in the RPC, not here.
 *
 * Volume, profit and referrals are all on the row, but only from `sm` up: at
 * 360px four numeric columns plus a username do not fit, and the ranking metric
 * is the one that has to survive the squeeze.
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
          1 point per $100 staked, 1 per $10 of profit, 1 per friend you invited who has settled a bet.
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
          <>
            {/* Column header, desktop only. Four numeric columns need labelling
                once at the top rather than on every row. */}
            <div className="mb-2 hidden items-center gap-3 px-4 sm:flex">
              <span className="w-7 shrink-0" />
              <span className="w-[34px] shrink-0" />
              <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Player</span>
              <span className="w-[86px] shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Volume</span>
              <span className="w-[96px] shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Profit</span>
              <span className="w-[52px] shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Refs</span>
              <span className="w-[80px] shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Points</span>
            </div>

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

                    <span
                      className="hidden w-[86px] shrink-0 text-right text-sm font-semibold sm:block"
                      style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}
                    >
                      ${Number(r.staked).toFixed(2)}
                    </span>

                    <span
                      className="hidden w-[96px] shrink-0 text-right text-sm font-semibold sm:block"
                      style={{
                        color: profit > 0 ? "var(--pos)" : profit < 0 ? "var(--neg)" : "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {money(profit)}
                    </span>

                    <span
                      className="hidden w-[52px] shrink-0 text-right text-sm font-semibold sm:block"
                      style={{ color: Number(r.referrals) > 0 ? "var(--text)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {Number(r.referrals)}
                    </span>

                    <span
                      className="w-[72px] shrink-0 text-right text-[15px] font-semibold sm:w-[80px]"
                      style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {Number(r.points).toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

"""


def main():
    if not os.path.exists(PATH):
        print("ERROR: %s not found. Run from repo root." % PATH)
        sys.exit(1)
    s = open(PATH).read()

    problems = []
    for label, marker in (("start", START), ("end", END)):
        n = s.count(marker)
        if n != 1:
            problems.append("  %s marker %r found %d times (expected 1)" % (label, marker, n))
    if problems:
        print("ABORTED - nothing written:")
        print("\n".join(problems))
        print("")
        print("If the start marker is missing, leaderboard v1 was never applied.")
        print("If either is doubled, the file drifted. git checkout -- %s" % PATH)
        sys.exit(1)

    a = s.index(START)
    b = s.index(END)
    if a >= b:
        print("ABORTED - markers are out of order; the file is not what this expects.")
        sys.exit(1)

    shutil.copy(PATH, PATH + ".bak")
    open(PATH, "w").write(s[:a] + NEW + s[b:])
    print("Patched %s (backup at %s.bak)" % (PATH, PATH))
    print("  replaced %d chars of v1 with %d chars of v2" % (b - a, len(NEW)))
    print("")
    print("Board now ranks on points, shows volume / profit / refs / points on")
    print("desktop, and points only at phone width.")


if __name__ == "__main__":
    main()
