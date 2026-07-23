import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Share2, Check, ArrowLeft } from "lucide-react";
import Avatar from "./Avatar";

/**
 * Public, shareable profile at /u/<username>. Standalone - NOT inside the
 * dashboard shell - so a logged-out visitor sees a clean page, not the whole
 * betting app. Reads /api/content?type=profile, which returns only safe
 * aggregate stats (no addresses, no balances, no net P&L).
 */
export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/content?type=profile&username=${encodeURIComponent(username || "")}`);
        if (res.status === 404) { setState("notfound"); return; }
        if (!res.ok) throw new Error();
        setData(await res.json());
        setState("ok");
      } catch { setState("notfound"); }
    })();
  }, [username]);

  // Native share sheet where available (mobile), clipboard copy everywhere else.
  async function shareProfile() {
    const url = `${window.location.origin}/u/${username}`;
    if (navigator.share) {
      try { await navigator.share({ title: `@${username} on PredArena`, url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header - the way home is always visible, not just a CTA at the bottom */}
      <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--panel) 92%, transparent)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav("/")}
              aria-label="Back to PredArena"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-all active:scale-95"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <ArrowLeft size={16} />
            </button>
            <button onClick={() => nav("/")} className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] text-xs font-bold text-white" style={{ background: "var(--brand-grad)" }}>P</div>
              <span className="font-display text-[15px]" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>PREDARENA</span>
            </button>
          </div>
          {state === "ok" && (
            <button
              onClick={shareProfile}
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold transition-all active:scale-[0.97]"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: copied ? "var(--accent)" : "var(--text)" }}
            >
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? "Copied" : "Share"}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        {state === "loading" && (
          <p className="py-24 text-center" style={{ color: "var(--text-soft)" }}>Loading…</p>
        )}

        {state === "notfound" && (
          <div className="py-24 text-center">
            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Profile not found</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-soft)" }}>No bettor goes by @{username}.</p>
            <button onClick={() => nav("/")} className="mt-5 inline-flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--brand-grad)" }}>
              <ArrowLeft size={15} /> Back to PredArena
            </button>
          </div>
        )}

        {state === "ok" && data && (
          <>
            {/* Hero - win rate carries the page, the way it does on the share card */}
            <section className="rounded-[24px] p-7" style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center gap-4">
                <Avatar seed={data.username} size={64} uploadedUrl={data.avatar_url} />
                <div className="min-w-0">
                  <p className="truncate text-2xl font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>@{data.username}</p>
                  <p className="text-xs" style={{ color: "var(--text-soft)" }}>PredArena bettor</p>
                </div>
              </div>

              <div className="mt-7 flex items-end gap-8">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>Win Rate</p>
                  <p className="mt-1 text-[52px] font-bold leading-none tracking-[-0.03em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                    {data.win_rate != null ? `${data.win_rate}%` : "—"}
                  </p>
                </div>
                <div className="pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>Record</p>
                  <p className="mt-1 text-2xl font-semibold leading-none" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                    {data.won}<span className="text-base" style={{ color: "var(--text-muted)" }}>W</span>
                    {" · "}
                    {data.lost}<span className="text-base" style={{ color: "var(--text-muted)" }}>L</span>
                  </p>
                </div>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-3">
                <Stat label="Total Bets" value={String(data.total_bets)} />
                <Stat label="Won" value={String(data.won)} tone="pos" />
                <Stat label="Void" value={String(data.void ?? 0)} />
              </div>
            </section>

            <PublicBets username={data.username} />

            <button
              onClick={() => nav("/")}
              className="mt-8 w-full rounded-[14px] px-5 py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.99]"
              style={{ background: "var(--brand-grad)" }}
            >
              Start betting on PredArena
            </button>
          </>
        )}
      </main>
    </div>
  );
}

/** "2h ago" for anything recent, a plain date once it's older than a week. */
function timeAgo(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PublicBets({ username }: { username: string }) {
  const [bets, setBets] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/content?type=bets&username=${encodeURIComponent(username)}&offset=${offset}`);
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled) return;
        setBets(d.bets || []);
        setTotal(d.total || 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username, offset]);

  const pages = Math.ceil(total / 10);
  const page = Math.floor(offset / 10) + 1;

  const pill = (o: string) => {
    const map: Record<string, { t: string; c: string; bg: string }> = {
      won:  { t: "Won",  c: "var(--pos)", bg: "color-mix(in srgb, var(--pos) 14%, transparent)" },
      lost: { t: "Lost", c: "var(--neg)", bg: "color-mix(in srgb, var(--neg) 14%, transparent)" },
      void: { t: "Void", c: "var(--text-soft)", bg: "var(--panel-2)" },
      open: { t: "Open", c: "var(--text-soft)", bg: "var(--panel-2)" },
    };
    const m = map[o] || map.open;
    return (
      <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: m.c, background: m.bg }}>
        {m.t}
      </span>
    );
  };

  return (
    <section className="mt-6 rounded-[24px] p-6" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Recent bets</p>
        {total > 0 && <p className="text-xs" style={{ color: "var(--text-soft)" }}>{total} total</p>}
      </div>

      {loading && bets.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--text-soft)" }}>Loading…</p>
      ) : bets.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--text-soft)" }}>No bets yet.</p>
      ) : (
        <div className="space-y-2">
          {bets.map((b, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3"
                 style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)" }}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                  {b.is_combo ? `${b.legs}-leg combo` : `${b.coin_a} vs ${b.coin_b}`}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {b.is_combo ? "Combo" : `Picked ${b.side === 1 ? b.coin_a : b.coin_b}`}
                  {" · "}{Number(b.odds).toFixed(2)}x
                  {b.placed_at ? ` · ${timeAgo(b.placed_at)}` : ""}
                </p>
              </div>
              {pill(b.outcome)}
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - 10))}
            disabled={offset === 0}
            className="rounded-[10px] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >Prev</button>
          <span className="text-xs" style={{ color: "var(--text-soft)" }}>Page {page} of {pages}</span>
          <button
            onClick={() => setOffset(offset + 10)}
            disabled={page >= pages}
            className="rounded-[10px] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >Next</button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" }) {
  return (
    <div className="rounded-[14px] p-3.5" style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1.5 text-lg font-semibold" style={{ color: tone === "pos" ? "var(--pos)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}
