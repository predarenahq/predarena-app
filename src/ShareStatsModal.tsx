import React, { useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";
import Avatar from "./Avatar";

/**
 * Shareable P&L card. Opens from "Share my stats" on the private profile.
 * Reads the same stats object ProfilePage computes - no new query. The user
 * chooses whether to include the net P&L amount (their own number, their call).
 */
export default function ShareStatsModal({
  open, onClose, username, stats, avatarUrl,
}: {
  open: boolean;
  onClose: () => void;
  username: string | null;
  avatarUrl?: string | null;
  stats: { winRate: string; won: number; lost: number; total: number; pnl: number; since: string };
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Default: show P&L only if positive (flex wins, hide losses unless chosen).
  const [showPnl, setShowPnl] = useState(stats.pnl > 0);
  const [busy, setBusy] = useState(false);

  const pnlUp = stats.pnl >= 0;
  const pnlStr = `${pnlUp ? "+" : "-"}$${Math.abs(stats.pnl).toFixed(2)}`;
  const handle = username ? `@${username}` : "PredArena bettor";
  const profileUrl = username ? `predarena-app.vercel.app/?ref=${username}` : "predarena-app.vercel.app";

  const download = useCallback(async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        width: 500,
        height: 297,
        pixelRatio: 1,
        cacheBust: true,
        style: { transform: "none", margin: "0" },
      });
      const a = document.createElement("a");
      a.download = `predarena-${username || "stats"}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error("card render failed", e);
    } finally {
      setBusy(false);
    }
  }, [username]);

  const shareX = useCallback(() => {
    const text = showPnl
      ? `My PredArena record: ${stats.winRate} win rate, ${pnlStr} P&L over ${stats.total} bets.`
      : `My PredArena record: ${stats.winRate} win rate over ${stats.total} bets.`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://" + profileUrl)}`;
    window.open(url, "_blank");
  }, [showPnl, stats, pnlStr, profileUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-[20px] p-6" style={{ background: "var(--panel)" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Share your stats</h3>
          <button onClick={onClose} className="text-sm" style={{ color: "var(--text-soft)" }}>Close</button>
        </div>

        {/* THE CARD - always 500x297 for capture; preview scaled to fit modal */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center", overflow: "hidden" }}>
        <div
          ref={(wrap) => {
            if (wrap) {
              const avail = wrap.parentElement?.clientWidth || 500;
              const scale = Math.min(1, avail / 500);
              wrap.style.transform = `scale(${scale})`;
              wrap.style.transformOrigin = "top center";
              wrap.style.height = `${297 * scale}px`;
            }
          }}
          style={{ width: 500 }}
        >
        <div ref={cardRef} style={{
          width: 500, height: 297, borderRadius: 16, padding: 22, boxSizing: "border-box", flexShrink: 0,
          background: "linear-gradient(135deg, #1a1d23 0%, #0f1115 100%)",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          border: "1px solid #2a2e37",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "#34D399", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>PREDARENA</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#9ca3af", fontSize: 14 }}>{handle}</span>
              <Avatar seed={username} size={36} uploadedUrl={avatarUrl} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div>
              <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>Win Rate</div>
              <div style={{ color: "#fff", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{stats.winRate}</div>
            </div>
            {showPnl && (
              <div>
                <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>Net P&L</div>
                <div style={{ color: pnlUp ? "#34D399" : "#f87171", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{pnlStr}</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ color: "#9ca3af", fontSize: 13 }}>
              {stats.won}W · {stats.lost}L · {stats.total} bets
            </div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>{profileUrl}</div>
          </div>
        </div>
        </div>
        </div>

        {/* Toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={showPnl} onChange={(e) => setShowPnl(e.target.checked)} />
          <span className="text-sm" style={{ color: "var(--text)" }}>Include P&L amount</span>
        </label>

        {/* Actions */}
        <div className="flex gap-2 mt-5">
          <button onClick={download} disabled={busy}
            className="flex-1 rounded-[12px] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--brand-grad)" }}>
            {busy ? "Rendering..." : "Download image"}
          </button>
          <button onClick={shareX}
            className="flex-1 rounded-[12px] px-4 py-2.5 text-sm font-semibold"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}>
            Share on X
          </button>
        </div>
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          X can't auto-attach images - download first, then attach it to the pre-filled post.
        </p>
      </div>
    </div>
  );
}
