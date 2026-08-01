import React, { useEffect, useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";

type GateState =
  | "loading"
  | "code"
  | "email"
  | "checking"
  | "in"
  | "denied"
  | "no_email";

const ACCENT = "#34D399";
const BG = "#0B0B0F";
const PANEL = "#141419";
const LINE = "rgba(255,255,255,0.08)";
const TEXT = "#F4F4F5";
const SOFT = "#8A8A94";
const DANGER = "#F87171";

const post = (body: any) =>
  fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const [state, setState] = useState<GateState>("loading");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resolveAfterAuth = useCallback(
    async (validatedCode: string | null) => {
      setState("checking");
      try {
        const token = await getAccessToken();
        if (!token) {
          setState(validatedCode ? "email" : "code");
          return;
        }
        const gateRes = await post({ action: "gate", privyToken: token });
        if (gateRes.ok) {
          setState("in");
          return;
        }
        const gateBody = await gateRes.json().catch(() => ({}));
        if (gateBody?.error === "no_email") {
          setState("no_email");
          return;
        }
        if (validatedCode) {
          const rRes = await post({
            action: "redeem",
            privyToken: token,
            code: validatedCode,
          });
          if (rRes.ok) {
            setState("in");
            return;
          }
          const rBody = await rRes.json().catch(() => ({}));
          setCodeError(
            rBody?.error === "code_used"
              ? "That code has already been used."
              : rBody?.error === "invalid_code"
              ? "We don't recognize that code."
              : "Couldn't redeem that code. Try again."
          );
          setState("denied");
          return;
        }
        setState("denied");
      } catch {
        setState("denied");
      }
    },
    [getAccessToken]
  );

  useEffect(() => {
    if (!ready) return;
    if (authenticated) {
      resolveAfterAuth(code || null);
      return;
    }
    setState((prev) => (prev === "email" ? "email" : "code"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  const submitCode = async () => {
    const c = code.trim().toUpperCase();
    if (!c) {
      setCodeError("Enter your invite code.");
      return;
    }
    setBusy(true);
    setCodeError(null);
    try {
      const res = await post({ action: "check_code", code: c });
      if (res.ok) {
        setCode(c);
        setState("email");
      } else {
        const body = await res.json().catch(() => ({}));
        setCodeError(
          body?.error === "code_used"
            ? "That code has already been used."
            : "We don't recognize that code."
        );
      }
    } catch {
      setCodeError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "in") return <>{children}</>;

  return (
    <div style={wrap}>
      <div aria-hidden style={ambient} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
        style={card}
      >
        <div style={chip}>
          <img src="/preda-mark-white.png" alt="" style={{ height: 30, width: 30 }} />
        </div>

        <AnimatePresence mode="wait">
          {(state === "loading" || state === "checking") && (
            <Step key="checking">
              <h1 style={h1}>Verifying access</h1>
              <p style={sub}>One moment.</p>
              <Dots />
            </Step>
          )}

          {state === "code" && (
            <Step key="code">
              <div style={eyebrow}>Invite-only pilot</div>
              <h1 style={h1}>Enter your invite code</h1>
              <p style={sub}>
                PredArena is invite-only right now. Enter the code you were given
                to continue.
              </p>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (codeError) setCodeError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && submitCode()}
                placeholder="PREDA-XXXX"
                autoFocus
                spellCheck={false}
                autoCapitalize="characters"
                style={{ ...input, borderColor: codeError ? DANGER : LINE }}
              />
              {codeError && <div style={errText}>{codeError}</div>}
              <button
                onClick={submitCode}
                disabled={busy}
                style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
                onMouseDown={press}
                onMouseUp={release}
                onMouseLeave={release}
              >
                {busy ? "Checking..." : "Continue"}
              </button>
              <button onClick={login} style={linkBtn}>
                Already have access? Sign in
              </button>
            </Step>
          )}

          {state === "email" && (
            <Step key="email">
              <div style={eyebrow}>Code accepted</div>
              <h1 style={h1}>Sign in with your email</h1>
              <p style={sub}>
                Almost there. Sign in with your email to lock this invite to your
                account.
              </p>
              <button
                onClick={login}
                style={primaryBtn}
                onMouseDown={press}
                onMouseUp={release}
                onMouseLeave={release}
              >
                Continue with email
              </button>
              <button
                onClick={() => {
                  setState("code");
                  setCode("");
                }}
                style={ghostBtn}
              >
                Use a different code
              </button>
            </Step>
          )}

          {state === "denied" && (
            <Step key="denied">
              <div style={{ ...eyebrow, color: SOFT }}>Not in the pilot</div>
              <h1 style={h1}>This email isn't invited</h1>
              <p style={sub}>
                {codeError
                  ? codeError
                  : "This email isn't on the pilot list, and no valid code is attached to it."}{" "}
                Sign in with the email tied to your invite, or start over with a
                code.
              </p>
              <button
                onClick={() =>
                  logout().then(() => {
                    setCode("");
                    setCodeError(null);
                    setState("code");
                  })
                }
                style={primaryBtn}
                onMouseDown={press}
                onMouseUp={release}
                onMouseLeave={release}
              >
                Start over
              </button>
            </Step>
          )}

          {state === "no_email" && (
            <Step key="no_email">
              <div style={{ ...eyebrow, color: SOFT }}>Email needed</div>
              <h1 style={h1}>Sign in with email</h1>
              <p style={sub}>
                The pilot is gated by email, not wallet. Sign in with the email
                you were invited on.
              </p>
              <button
                onClick={() =>
                  logout().then(() => {
                    setCode("");
                    setState("code");
                  })
                }
                style={primaryBtn}
                onMouseDown={press}
                onMouseUp={release}
                onMouseLeave={release}
              >
                Start over
              </button>
            </Step>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {children}
    </motion.div>
  );
}

function Dots() {
  return (
    <div style={{ marginTop: 24, display: "flex", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{ height: 6, width: 6, borderRadius: 999, background: ACCENT }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

const press = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = "scale(0.98)";
};
const release = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = "scale(1)";
};

const wrap: React.CSSProperties = {
  minHeight: "100dvh",
  background: BG,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: "'Space Grotesk', 'Inter', -apple-system, system-ui, sans-serif",
  position: "relative",
  overflow: "hidden",
};

const ambient: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(600px circle at 22% 12%, rgba(52,211,153,0.10), transparent 55%)",
  pointerEvents: "none",
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  background: PANEL,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 24,
  padding: 36,
  position: "relative",
  boxShadow: "0 1px 3px rgba(0,0,0,0.4), 0 30px 80px rgba(0,0,0,0.5)",
};

const chip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 56,
  width: 56,
  borderRadius: 16,
  background: "linear-gradient(135deg, #10241C, #0C3D2B)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 24,
};

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

const input: React.CSSProperties = {
  marginTop: 22,
  height: 50,
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#0E0E13",
  color: TEXT,
  fontSize: 17,
  fontWeight: 600,
  letterSpacing: "0.14em",
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  textAlign: "center",
  outline: "none",
  transition: "border-color 140ms ease",
};

const errText: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  color: DANGER,
  lineHeight: 1.4,
};

const primaryBtn: React.CSSProperties = {
  marginTop: 24,
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

const linkBtn: React.CSSProperties = {
  marginTop: 18,
  width: "100%",
  background: "transparent",
  border: "none",
  color: SOFT,
  fontSize: 13.5,
  fontWeight: 500,
  cursor: "pointer",
  padding: 4,
  transition: "color 140ms ease",
};

const ghostBtn: React.CSSProperties = {
  marginTop: 12,
  height: 44,
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: TEXT,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "transform 140ms cubic-bezier(0.23,1,0.32,1), border-color 140ms ease",
};
