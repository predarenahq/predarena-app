import { useCallback, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

/**
 * Connect-on-demand for the Solana wallet. With autoConnect off, the wallet is
 * only connected when the user deliberately acts (sign-in, deposit, withdraw,
 * bet). ensureConnected() opens the wallet picker if needed and resolves once a
 * publicKey is live - so an action can `await ensureConnected()` then proceed.
 *
 * Returns true if connected (already, or after the user picks), false if the
 * user dismissed the picker without connecting (timeout).
 */
export function useWalletConnect() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  // Live mirror of connection state so the polling promise reads fresh values
  // (the action's closure captured stale connected/publicKey).
  const liveRef = useRef({ connected, publicKey });
  useEffect(() => { liveRef.current = { connected, publicKey }; }, [connected, publicKey]);

  const ensureConnected = useCallback(async (): Promise<import('@solana/web3.js').PublicKey | null> => {
    if (liveRef.current.connected && liveRef.current.publicKey) return liveRef.current.publicKey;

    // Open the picker and wait for a connection to appear. Poll the live ref;
    // resolve on connect, give up after ~60s (user closed the modal / walked away).
    setVisible(true);
    const start = Date.now();
    return new Promise<import('@solana/web3.js').PublicKey | null>((resolve) => {
      const iv = setInterval(() => {
        if (liveRef.current.connected && liveRef.current.publicKey) {
          clearInterval(iv);
          resolve(liveRef.current.publicKey);
        } else if (Date.now() - start > 60000) {
          clearInterval(iv);
          resolve(null);
        }
      }, 250);
    });
  }, [setVisible]);

  return { ensureConnected };
}
