import React, { createContext, useContext, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * One session for the whole app: the token minted by /api/session, held in
 * sessionStorage, and a myData() helper every read site calls instead of
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
  myData: (type: "tickets" | "balance" | "me") => Promise<any>;
};

const SessionCtx = createContext<SessionValue>({
  token: null, addresses: [], username: null, signedIn: false,
  signIn: async () => false, signOut: () => {},
  linkWallet: async () => ({ ok: false }),
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
async function signNonce(): Promise<{ address: string; nonce: string; signature: string } | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  const [address] = await eth.request({ method: "eth_requestAccounts" });
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
  for (const b of sigBytes) bin += String.fromCharCode(b);
  return { address, nonce: data.nonce, signature: btoa(bin) };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  });
  const [addresses, setAddresses] = useState<string[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const { publicKey, signMessage } = useWallet();

  const setToken = useCallback((t: string | null) => {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* private mode */ }
    setTokenState(t);
  }, []);

  const signIn = useCallback(async () => {
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
    return true;
  }, [setToken, publicKey, signMessage]);

  const signOut = useCallback(() => {
    setToken(null);
    setAddresses([]);
    setUsername(null);
  }, [setToken]);

  const linkWallet = useCallback(async () => {
    if (!token) return { ok: false, error: "not_signed_in" };
    const signed = await signNonce();
    if (!signed) return { ok: false, error: "no_wallet" };
    const { res, data } = await postSession(
      { action: "link", nonce: signed.nonce, signature: signed.signature }, token);
    if (!res.ok) return { ok: false, error: data.error };
    // Refresh the address list so reads immediately widen to the new wallet.
    const me = await myDataInternal("me", token);
    if (me?.addresses) setAddresses(me.addresses);
    return { ok: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const myData = useCallback((type: "tickets" | "balance" | "me") =>
    myDataInternal(type, token), [myDataInternal, token]);

  return (
    <SessionCtx.Provider value={{
      token, addresses, username, signedIn: !!token,
      signIn, signOut, linkWallet, myData,
    }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  return useContext(SessionCtx);
}
