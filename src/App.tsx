import React, { useMemo } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import BattleDetailPage from "./BattleDetailPage";
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
    <SessionProvider>
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
          walletList: [
            "metamask",
            "phantom",
            "solflare",
            "coinbase_wallet",
            "detected_solana_wallets",
            "detected_wallets",
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
            <BrowserRouter>
              <Routes>
                <Route path="/battle/:id" element={<BattleDetailPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/bet/:code" element={<BetSharePage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<PredaLandingDashboardMockup />} />
              </Routes>
            </BrowserRouter>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PrivyProvider>
    </SessionProvider>
    </ThemeProvider>
  );
}

export default App;
