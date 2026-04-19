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

function App() {
  const network = WalletAdapterNetwork.Devnet;
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
          background: "#080c14",
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
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["wallet", "email"],
        appearance: {
          theme: "dark",
          accentColor: "#00d4ff",
          walletList: ["phantom", "solflare", "coinbase_wallet", "detected_solana_wallets"],
        },

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
  );
}

export default App;