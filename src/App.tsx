import React, { useMemo, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import BattleDetailPage from "./BattleDetailPage";
import PublicProfilePage from "./PublicProfilePage";
import NewsPage from "./NewsPage";
import BetSharePage from "./BetSharePage";
import AdminPage from "./AdminPage";
import { PrivyProvider } from "@privy-io/react-auth";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import PredaLandingDashboardMockup from "./PredaLandingDashboardMockup";
import "@solana/wallet-adapter-react-ui/styles.css";
import { arcTestnet } from "./arc/chain";
import { ThemeProvider } from "./useTheme";
import { SessionProvider } from "./useSession";

function App() {
  // Capture ?ref=<username> from the landing URL into localStorage, so a referral
  // link attributes even though the user won't create a profile until sign-in.
  // Read + cleared at sign-in (useSession). Runs once on load.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("preda_ref", ref);
    } catch {}
  }, []);

  const network  = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    []
  );

  const privyAppId = process.env.REACT_APP_PRIVY_APP_ID;

  if (!privyAppId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        Missing REACT_APP_PRIVY_APP_ID in .env
      </div>
    );
  }

  return (
    <ThemeProvider>
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["wallet", "email"],
        appearance: {
          theme: "dark",
          // A literal hex, deliberately. Privy renders its login in an IFRAME, which
          // cannot see this document's CSS vars - var(--accent) would resolve to
          // nothing there. Its type is `#${string}` for exactly this reason.
          // Keep in sync with --accent (dark): #34D399.
          accentColor: "#34D399",
          // Added EVM wallets alongside existing Solana wallets
          // EVM only. The Solana wallet-adapter owns Solana wallets - listing
          // them here too made both systems race for the same extension on load.
          walletList: [
            "metamask",
            "coinbase_wallet",
            "wallet_connect",
          ],
        },
        // Arc testnet as the supported EVM chain
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
      }}
    >
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={true}>
          <WalletModalProvider>
            <SessionProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/battle/:id" element={<BattleDetailPage />} />
                <Route path="/u/:username" element={<PublicProfilePage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/bet/:code" element={<BetSharePage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<PredaLandingDashboardMockup />} />
              </Routes>
            </BrowserRouter>
            </SessionProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PrivyProvider>
    </ThemeProvider>
  );
}

export default App;
