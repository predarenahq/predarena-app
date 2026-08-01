import React, { useEffect, useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";

// The invite gate. Renders its children only for an allowlisted, Privy-verified
// email. Everything else sees the wall. The REAL check is server-side
// (/api/session action:'gate' verifies the Privy token + reads the allowlist);
// this component is the surface that drives that check and reflects its result.

type GateState = "loading" | "anon" | "checking" | "in" | "denied" | "no_email";

const ACCENT = "#34D399";
const BG = "#0B0B0F";
const PANEL = "#141419";
const LINE = "rgba(255,255,255,0.08)";
const TEXT = "#F4F4F5";
const SOFT = "#8A8A94";

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const [state, setState] = useState<GateState>("loading");

  const runGate = useCallback(async () => {
    setState("checking");
    try {
      const token = await getAccessToken();
      if (!token) {
        setState("anon");
        return;
      }
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate", privyToken: token }),
      });
      if (res.ok) {
        setState("in");
        return;
      }
      const body = await res.json().catch(() => ({}));
      setState(body?.error === "no_email" ? "no_email" : "denied");
    } catch {
      setState("denied");
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setState("anon");
      return;
    }
    runGate();
  }, [ready, authenticated, runGate]);

  // Verified + allowlisted: hand off to the app.
  if (state === "in") return <>{children}</>;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily:
          "'Space Grotesk', 'Inter', -apple-system, system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient: a single quiet green wash, top-left. One accent, held back. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(600px circle at 22% 12%, rgba(52,211,153,0.10), transparent 55%)",
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
        style={{
          width: "100%",
          maxWidth: 400,
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 24,
          padding: 36,
          position: "relative",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4), 0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* The mark — the one signature element. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 56,
            width: 56,
            borderRadius: 16,
            background: `linear-gradient(135deg, #10241C, #0C3D2B)`,
            border: `1px solid ${LINE}`,
            marginBottom: 24,
          }}
        >
          <img
            src="/preda-mark-white.png"
            alt=""
            style={{ height: 30, width: 30 }}
          />
        </div>

        <AnimatePresence mode="wait">
          {(state === "loading" || state === "checking") && (
            <motion.div
              key="checking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <h1 style={h1}>Verifying access</h1>
              <p style={sub}>One moment while we check your invite.</p>
              <div style={{ marginTop: 24, display: "flex", gap: 6 }}>
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    style={{
                      height: 6,
                      width: 6,
                      borderRadius: 999,
                      background: ACCENT,
                    }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {state === "anon" && (
            <motion.div
              key="anon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div style={eyebrow}>Invite-only pilot</div>
              <h1 style={h1}>Welcome to PredArena</h1>
              <p style={sub}>
                Access is limited during the pilot. Sign in with the email you
                were invited on.
              </p>
              <button
                onClick={login}
                style={primaryBtn}
                onMouseDown={(e) =>
                  (e.currentTarget.style.transform = "scale(0.98)")
                }
                onMouseUp={(e) =>
                  (e.currentTarget.style.transform = "scale(1)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "scale(1)")
                }
              >
                Continue with email
              </button>
            </motion.div>
          )}

          {state === "denied" && (
            <motion.div
              key="denied"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div style={{ ...eyebrow, color: SOFT }}>Not on the list yet</div>
              <h1 style={h1}>You're not in the pilot</h1>
              <p style={sub}>
                This email isn't on the invite list. If you think it should be,
                reach out to the person who invited you.
              </p>
              <button
                onClick={() => logout().then(() => setState("anon"))}
                style={ghostBtn}
              >
                Try a different email
              </button>
            </motion.div>
          )}

          {state === "no_email" && (
            <motion.div
              key="no_email"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div style={{ ...eyebrow, color: SOFT }}>Email needed</div>
              <h1 style={h1}>Sign in with email</h1>
              <p style={sub}>
                The pilot is gated by email. Sign in with the email you were
                invited on, not a wallet.
              </p>
              <button
                onClick={() => logout().then(() => setState("anon"))}
                style={ghostBtn}
              >
                Start over
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: ACCENT,
  marginBottom: 14,
};

const h1: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: TEXT,
  margin: 0,
  lineHeight: 1.15,
};

const sub: React.CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.5,
  color: SOFT,
  marginTop: 12,
  marginBottom: 0,
};

const primaryBtn: React.CSSProperties = {
  marginTop: 28,
  height: 46,
  width: "100%",
  borderRadius: 12,
  border: "none",
  background: ACCENT,
  color: "#04120C",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 140ms cubic-bezier(0.23,1,0.32,1), filter 140ms ease",
};

const ghostBtn: React.CSSProperties = {
  marginTop: 24,
  height: 44,
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: TEXT,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "transform 140ms cubic-bezier(0.23,1,0.32,1), border-color 140ms ease",
};
