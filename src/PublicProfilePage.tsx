import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

/**
 * Public, shareable profile at /u/<username>. Standalone - NOT inside the
 * dashboard shell - so a logged-out visitor sees a clean card, not the whole
 * betting app. Reads /api/content?type=profile, which returns only safe
 * aggregate stats (no addresses, no balances, no net P&L).
 */
export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }} className="flex flex-col items-center justify-center px-4">
      {state === "loading" && <p style={{ color: "var(--text-soft)" }}>Loading...</p>}

      {state === "notfound" && (
        <div className="text-center">
          <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Profile not found</p>
          <button onClick={() => nav("/")} className="mt-4 rounded-[12px] px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--brand-grad)" }}>Go to PredArena</button>
        </div>
      )}

      {state === "ok" && data && (
        <div className="w-full max-w-lg rounded-[24px] p-8" style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[16px] text-lg font-bold text-white" style={{ background: "var(--brand-grad)" }}>
              {data.username?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>@{data.username}</p>
              <p className="text-xs" style={{ color: "var(--text-soft)" }}>PredArena bettor</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Stat label="Win Rate" value={data.win_rate != null ? `${data.win_rate}%` : "—"} />
            <Stat label="Total Bets" value={String(data.total_bets)} />
            <Stat label="Won" value={String(data.won)} tone="pos" />
            <Stat label="Lost" value={String(data.lost)} />
          </div>

          <PublicBets username={data.username} />

          <button onClick={() => nav("/")} className="mt-6 w-full rounded-[12px] px-5 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: "var(--brand-grad)" }}>
            Start betting on PredArena
          </button>
        </div>
      )}
    </div>
  );
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
    const map: Record<string, { t: string; c: string }> = {
      won:  { t: "Won",  c: "var(--pos)" },
      lost: { t: "Lost", c: "var(--neg)" },
      void: { t: "Void", c: "var(--text-soft)" },
      open: { t: "Open", c: "var(--text-soft)" },
    };
    const m = map[o] || map.open;
    return <span className="text-[11px] font-semibold" style={{ color: m.c }}>{m.t}</span>;
  };

  return (
    <div className="mt-6">
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Recent bets</p>
      {loading && bets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-soft)" }}>Loading...</p>
      ) : bets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-soft)" }}>No bets yet.</p>
      ) : (
        <div className="space-y-2">
          {bets.map((b, i) => (
            <div key={i} className="flex items-center justify-between rounded-[12px] px-4 py-3"
                 style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {b.is_combo ? `${b.legs}-leg combo` : `${b.coin_a} vs ${b.coin_b}`}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {b.is_combo ? "Combo" : `Picked ${b.side === 1 ? b.coin_a : b.coin_b}`} · {Number(b.odds).toFixed(2)}x
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
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" }) {
  return (
    <div className="rounded-[14px] p-4" style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-2 text-lg font-semibold" style={{ color: tone === "pos" ? "var(--pos)" : "var(--text)" }}>{value}</p>
    </div>
  );
}
