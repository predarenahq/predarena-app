import React, { createContext, useContext, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWallets } from "@privy-io/react-auth";

/**
 * One session for the whole app: the token minted by /api/session, held in
 * localStorage, and a myData() helper every read site calls instead of
 * touching Supabase directly.
 *
 * Why this exists: tickets and user_balances are world-readable via the anon
 * key today. They cannot be RLS-locked while the browser reads them directly,
 * because the database has no identity to key a policy on. The fix is: reads go
 * through /api/my-data with a session token that proves - by signature - which
 * addresses the caller owns. Once all reads use this, RLS goes deny-all.
 *
 * Expiry is handled quietly (option a): a 401 clears the token and callers get
 * an unauthenticated state to render "sign in to see your bets", rather than a
 * wallet popup ambushing the user mid-scroll.
 */

const TOKEN_KEY = "preda_session";

type SessionValue = {
  token: string | null;
  addresses: string[];
  username: string | null;
  signedIn: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => void;
  linkWallet: () => Promise<{ ok: boolean; error?: string }>;
  setUsernameFor: (name: string) => Promise<{ ok: boolean; error?: string }>;
  avatarUrl: string | null;
  uploadAvatar: (file: File) => Promise<{ ok: boolean; error?: string }>;
  unlinkedWallet: string | null;   // a connected address not yet on the profile (banner cue)
  myData: (type: "tickets" | "balance" | "me" | "referrals" | "referrals") => Promise<any>;
};

const SessionCtx = createContext<SessionValue>({
  token: null, addresses: [], username: null, signedIn: false,
  signIn: async () => false, signOut: () => {},
  linkWallet: async () => ({ ok: false }),
  setUsernameFor: async () => ({ ok: false }),
  avatarUrl: null,
  uploadAvatar: async () => ({ ok: false }),
  unlinkedWallet: null,
  myData: async () => null,
});

async function postSession(body: any, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch("/api/session", { method: "POST", headers, body: JSON.stringify(body) });
  return { res, data: await res.json() };
}

// A signature over the server's nonce. EVM via personal_sign for now; the
// server also verifies Solana (nacl), but the wallet plumbing for that comes
// with the real multi-wallet UI.
async function signNonce(forcePicker = false): Promise<{ address: string; nonce: string; signature: string } | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;

  // For "add wallet", force the account chooser so the user can pick a DIFFERENT
  // account than last time. Plain eth_requestAccounts is remembered and returns
  // the same account silently - which is why adding a second wallet kept linking
  // the first. wallet_requestPermissions re-opens the picker every time.
  if (forcePicker) {
    try {
      await eth.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // User dismissed the picker - abort rather than fall through to [0].
      return null;
    }
  }

  const accounts = await eth.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0];
  if (!address) return null;

  const { res, data } = await postSession({ action: "nonce", address, chain: "evm" });
  if (!res.ok) return null;
  const signature = await eth.request({ method: "personal_sign", params: [data.message, address] });
  return { address, nonce: data.nonce, signature };
}

// Solana signs through the wallet adapter, not window.ethereum. The server
// re-encodes the same message for nacl.verify (UTF-8 bytes) and expects the
// ed25519 signature base64-encoded, address as the base58 pubkey.
async function signNonceSolana(
  publicKey: { toBase58(): string },
  signMessage: (m: Uint8Array) => Promise<Uint8Array>
): Promise<{ address: string; nonce: string; signature: string } | null> {
  const address = publicKey.toBase58();
  const { res, data } = await postSession({ action: "nonce", address, chain: "solana" });
  if (!res.ok) return null;
  const sigBytes = await signMessage(new TextEncoder().encode(data.message));
  let bin = "";
  for (let i = 0; i < sigBytes.length; i++) bin += String.fromCharCode(sigBytes[i]);
  return { address, nonce: data.nonce, signature: btoa(bin) };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  });
  const [addresses, setAddresses] = useState<string[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { publicKey, signMessage } = useWallet();
  const { wallets: privyWallets } = useWallets();
  // First connected EVM wallet (eip155:*), if any. Address is lowercase from
  // Privy; the server checksums it in verify, so signing is unaffected.
  const evmAddress = privyWallets.find((w) => w.chainId?.startsWith("eip155:"))?.address || null;

  const setToken = useCallback((t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* private mode */ }
    setTokenState(t);
  }, []);

  const signIn = useCallback(async () => {
    suppressAutoSign.current = false;   // explicit intent re-enables auto-sign
    try { localStorage.removeItem("preda_logged_out"); } catch {}
    // A connected Solana wallet that can sign takes the Solana path; otherwise
    // fall back to the EVM/injected path. This is what puts a Solana address
    // into sess.addresses, so Solana-placed bets re-enter scope.
    const signed = (publicKey && signMessage)
      ? await signNonceSolana(publicKey, signMessage)
      : await signNonce();
    if (!signed) return false;
    const { res, data } = await postSession({ action: "verify", nonce: signed.nonce, signature: signed.signature });
    if (!res.ok) return false;
    setToken(data.token);
    setAddresses(data.addresses || [data.address]);
    setUsername(data.username ?? null);
    // Referral capture: if this user arrived via ?ref=<username> (stored on
    // landing), attribute it now that they have a profile. One-time; cleared
    // after. Failures (self-ref, not found, already referred) are silent.
    try {
      const ref = localStorage.getItem("preda_ref");
      if (ref) {
        await postSession({ action: "capture_referral", ref }, data.token);
        localStorage.removeItem("preda_ref");
      }
    } catch {}
    return true;
  }, [setToken, publicKey, signMessage]);

  const signOut = useCallback(() => {
    suppressAutoSign.current = true;   // don't let auto-sign-in refire before disconnect completes
    try { localStorage.setItem("preda_logged_out", "1"); } catch {}
    setToken(null);
    setAddresses([]);
    setUsername(null);
  }, [setToken]);

  const linkWallet = useCallback(async () => {
    if (!token) return { ok: false, error: "not_signed_in" };
    // Mirror signIn's wallet choice: a connected Solana wallet links via nacl,
    // otherwise EVM. Without this, linkWallet was EVM-only - you could sign IN
    // with Solana but never LINK a Solana address to an existing profile, so
    // Solana bets could not join an EVM-created session.
    const signed = (publicKey && signMessage)
      ? await signNonceSolana(publicKey, signMessage)
      : await signNonce(true);   // force the account picker for "add wallet"
    if (!signed) return { ok: false, error: "no_wallet" };
    const { res, data } = await postSession(
      { action: "link", nonce: signed.nonce, signature: signed.signature }, token);
    if (!res.ok) return { ok: false, error: data.error };
    // Refresh the address list so reads immediately widen to the new wallet.
    const me = await myDataInternal("me", token);
    if (me?.addresses) setAddresses(me.addresses);
    return { ok: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, publicKey, signMessage]);

  const uploadAvatar = useCallback(async (file: File) => {
    if (!token) return { ok: false, error: "not_signed_in" };
    if (file.size > 2 * 1024 * 1024) return { ok: false, error: "image_too_large" };
    // Read the file as a data URL and send to the authenticated endpoint.
    const image: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read_failed"));
      r.readAsDataURL(file);
    });
    const { res, data } = await postSession({ action: "set_avatar", image }, token);
    if (!res.ok) return { ok: false, error: data.error };
    setAvatarUrl(data.avatar_url);
    return { ok: true };
  }, [token]);

  const setUsernameFor = useCallback(async (name: string) => {
    if (!token) return { ok: false, error: "not_signed_in" };
    const { res, data } = await postSession({ action: "set_username", username: name }, token);
    if (!res.ok) return { ok: false, error: data.error };
    setUsername(data.username);
    return { ok: true };
  }, [token]);

  const myDataInternal = useCallback(async (type: string, tok: string | null) => {
    if (!tok) return null;
    const res = await fetch(`/api/my-data?type=${type}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.status === 401) {
      // Expired or revoked. Clear quietly; callers render a signed-out state.
      setToken(null);
      setAddresses([]);
      return null;
    }
    if (!res.ok) return null;
    return res.json();
  }, [setToken]);

  // Rehydrate profile from the stored token on mount. Without this, a refresh
  // keeps the token but forgets username + addresses (they reset to empty),
  // so the account panel looks signed-out-ish until you sign in again.
  // Auto sign-in when a Solana wallet connects. If the address is already linked,
  // signIn() resolves to the full profile; if not, it creates/links per the
  // server rules. Guarded so it fires once per connect, never mid-flight.
  // Rehydrate the profile from the stored token on mount - without this, a
  // refresh keeps the token but forgets username/addresses/avatar (they reset
  // to empty). Loads them from my-data so the account panel and avatar persist.
  React.useEffect(() => {
    if (!token) return;
    (async () => {
      const me = await myDataInternal("me", token);
      if (me) {
        setAddresses(me.addresses || []);
        setUsername(me.username ?? null);
        setAvatarUrl(me.avatar_url ?? null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoSignRef = React.useRef(false);
  // Backed by localStorage so an explicit logout survives refresh (a useRef
  // resets on reload, which let auto-sign fire after logout+refresh).
  const suppressAutoSign = React.useRef(
    (() => { try { return localStorage.getItem("preda_logged_out") === "1"; } catch { return false; } })()
  );
  React.useEffect(() => {
    if (token) { autoSignRef.current = false; return; }   // already signed in
    if (suppressAutoSign.current) return;                 // just logged out; wait for reconnect
    if (!publicKey || !signMessage) return;               // no solana wallet
    if (autoSignRef.current) return;                      // sign-in in flight
    autoSignRef.current = true;
    (async () => {
      try { await signIn(); } finally { autoSignRef.current = false; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, token]);

  // EVM/Privy auto sign-in - mirror of the Solana effect above, sharing the SAME
  // autoSignRef so the two can never both fire (a user with both wallets
  // connected would otherwise double-prompt). Only runs when there's an EVM
  // address, no Solana wallet took priority, and no session/in-flight sign-in.
  React.useEffect(() => {
    if (token) { autoSignRef.current = false; return; }
    if (suppressAutoSign.current) return;   // just logged out; wait for reconnect
    if (publicKey && signMessage) return;   // Solana effect handles this case
    if (!evmAddress) return;
    if (autoSignRef.current) return;
    autoSignRef.current = true;
    (async () => {
      try { await signIn(); } finally { autoSignRef.current = false; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evmAddress, token]);

  // A connected wallet that ISN'T on the profile yet - the cue for a
  // non-blocking "link this wallet?" banner. Detection only; never signs.
  const solAddr = publicKey?.toBase58() || null;
  const unlinkedWallet = React.useMemo(() => {
    if (!token) return null;
    const linked = addresses.map((a) => a.toLowerCase());
    for (const a of [solAddr, evmAddress]) {
      if (a && !linked.includes(a.toLowerCase())) return a;
    }
    return null;
  }, [token, addresses, solAddr, evmAddress]);

  React.useEffect(() => {
    if (!token) return;
    (async () => {
      const me = await myDataInternal("me", token);
      if (me) {
        setAddresses(me.addresses || []);
        setUsername(me.username ?? null);
      }
      // If me is null, myDataInternal already cleared an expired token.
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myData = useCallback((type: "tickets" | "balance" | "me" | "referrals" | "referrals") =>
    myDataInternal(type, token), [myDataInternal, token]);

  return (
    <SessionCtx.Provider value={{
      token, addresses, username, signedIn: !!token,
      signIn, signOut, linkWallet, setUsernameFor, avatarUrl, uploadAvatar, unlinkedWallet, myData,
    }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  return useContext(SessionCtx);
}
