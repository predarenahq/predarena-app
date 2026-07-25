import { useCallback, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

/**
 * Connect-on-demand for the Solana wallet. With autoConnect off, the modal only
 * SELECTS a wallet - it doesn't connect it (autoConnect used to do that). So we
 * bridge it: when a wallet becomes selected and isn't connected, call connect().
 * ensureConnected() opens the picker if needed and resolves once a publicKey is
 * live, so an action can `await ensureConnected()` then proceed.
 */
export function useWalletConnect() {
  const { connected, connecting, publicKey, wallet, connect } = useWallet();
  const { setVisible } = useWalletModal();

  // Live mirror so the polling promise reads fresh values (the caller's closure
  // captured stale state).
  const liveRef = useRef({ connected, publicKey });
  useEffect(() => { liveRef.current = { connected, publicKey }; }, [connected, publicKey]);

  // The bridge: once the modal selects a wallet (wallet != null) and we're not
  // connected or already connecting, fire connect(). This is what autoConnect
  // used to do; without it, clicking Phantom in the modal does nothing.
  useEffect(() => {
    if (wallet && !connected && !connecting) {
      connect().catch(() => { /* user rejected / not installed - stays disconnected */ });
    }
  }, [wallet, connected, connecting, connect]);

  const ensureConnected = useCallback(async (): Promise<import('@solana/web3.js').PublicKey | null> => {
    if (liveRef.current.connected && liveRef.current.publicKey) return liveRef.current.publicKey;

    setVisible(true);  // open the picker; the effect above connects on selection
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
