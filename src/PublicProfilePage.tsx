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
        <div className="w-full max-w-md rounded-[24px] p-8" style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
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

          <button onClick={() => nav("/")} className="mt-6 w-full rounded-[12px] px-5 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: "var(--brand-grad)" }}>
            Start betting on PredArena
          </button>
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
