import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useBattles } from "./hooks/useBattles";
import PriceChartModal from "./components/PriceChartModal";
import { supabase } from "./lib/supabase";

import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LayoutGrid,

  Menu,
  Wallet,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

type Side = "left" | "draw" | "right";
type MatchBoard = "Live" | "Upcoming";
type MatchCategory = "Major" | "Altcoins" | "L1" | "L2" | "DeFi" | "Meme" | "AI";
type MatchDuration = "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W" | "1M" | "1Y";

type Match = {
  id: string;
  category: MatchCategory;
  board: MatchBoard;
  duration: MatchDuration;
  league: string;
  title: string;
  subtitle: string;
  left: {
    ticker: string;
    odds: number;
    change: string;
  };
  draw: {
    odds: number;
    change: string;
  };
  right: {
    ticker: string;
    odds: number;
    change: string;
  };
  pool: number;
  entries: number;
  timer: string;
  status?: string;
  startTime?: string;
  startPriceA?: number;
  startPriceB?: number;
};

type SlipSelection = {
  matchId: string;
  matchTitle: string;
  chosenSide: Side;
  pickLabel: string;
  oddsAtPick: number;
  duration: MatchDuration;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ActiveBet {
  id: string;
  battleAddress: string;
  betAddress: string;
  picks: SlipSelection[];
  stake: number;
  combinedOdds: number;
  potentialWin: number;
  timestamp: number;
  status: "pending" | "running" | "won" | "lost" | "void";
  signature?: string;
}

const COLORS = {
  bg: "#080c14",
  panel: "#0d1420",
  line: "rgba(0,212,255,0.10)",
  lineStrong: "rgba(0,212,255,0.22)",
  accent: "#00d4ff",
  accentSoft: "rgba(0,212,255,0.10)",
  accentGlow: "rgba(0,212,255,0.14)",
  textSoft: "#7ab8c8",
};

const boardTabs: MatchBoard[] = ["Live", "Upcoming"];
const classTabs: MatchCategory[] = ["Major", "Altcoins", "L1", "L2", "DeFi", "Meme", "AI"];
const quickStakes = [10, 50, 100, 500];

const sidebarSections = [
  {
    title: "ARENA",
    items: [
      { label: "Crypto", path: "/" },
      { label: "Economy", path: "/economy", soon: true },
      { label: "Sports", path: "/sports", soon: true },
      { label: "Fanduel", path: "/fanduel", soon: true },
    ],
  },
  {
    title: "MARKETS",
    items: [
      { label: "5 mins", path: "/markets/5m" },
      { label: "15 mins", path: "/markets/15m" },
      { label: "30 mins", path: "/markets/30m" },
      { label: "1 hour", path: "/markets/1h" },
      { label: "4 hours", path: "/markets/4h" },
      { label: "1 Day", path: "/markets/1d" },
      { label: "1 Week", path: "/markets/1w" },
      { label: "1 Month", path: "/markets/1m" },
      { label: "1 Year", path: "/markets/1y" },
    ],
  },
  {
    title: "MY BETS",
    items: [
      { label: "Running Bets", path: "/running" },
      { label: "History", path: "/history" },
    ],
  },
  {
    title: "PRODUCT",
    items: [
      { label: "News", path: "/news" },
      { label: "Leaderboard", path: "/leaderboard" },
      { label: "How to Play", path: "/how-to-play" },
      { label: "Support", path: "/support" },
    ],
  },
];

const showSlides = [
  {
    title: "PREDA ARENA",
    text: "First crypto competition market. Battle coins, build parlays, and set records.",
    cta: "Open Arena",
  },
  {
    title: "SOCIAL + WALLET ACCESS",
    text: "Connect with X and wallet-first access built for crypto-native users.",
    cta: "Get Started",
  },
  {
    title: "COMING TO SOLANA",
    text: "Built by humans and AI on the Solana blockchain for best user experience.",
    cta: "Join Waitlist",
  },
];

const coinIcons: Record<string, string> = {
  BTC: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/btc.png",
  ETH: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png",
  SOL: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png",
  AVAX: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/avax.png",
  XRP: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/xrp.png",
  BNB: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/bnb.png",
  DOGE: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/doge.png",
  PEPE: "https://assets.coingecko.com/coins/images/29850/standard/pepe-token.jpeg",
  OP: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/op.png",
  ARB: "https://assets.coingecko.com/coins/images/16547/standard/photo_2023-03-29_21.47.00.jpeg",
  UNI: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/uni.png",
  LINK: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/link.png",
  RNDR: "https://assets.coingecko.com/coins/images/11636/standard/rndr.png",
  FET: "https://assets.coingecko.com/coins/images/5681/standard/Fetch.jpg",
};

const initialMatches: Match[] = [
  {
    id: "1",
    category: "Major",
    board: "Live",
    duration: "1h",
    league: "Crypto Majors",
    title: "BTC vs ETH",
    subtitle: "Who outperforms over the next hour?",
    left: { ticker: "BTC", odds: 1.76, change: "+0.84%" },
    draw: { odds: 3.4, change: "Tie move" },
    right: { ticker: "ETH", odds: 1.94, change: "+0.62%" },
    pool: 64800,
    entries: 412,
    timer: "43m left",
  },
  {
    id: "2",
    category: "L1",
    board: "Live",
    duration: "4h",
    league: "Layer 1 Arena",
    title: "SOL vs AVAX",
    subtitle: "Which chain wins this momentum round?",
    left: { ticker: "SOL", odds: 1.68, change: "+1.24%" },
    draw: { odds: 4.1, change: "Tie move" },
    right: { ticker: "AVAX", odds: 2.05, change: "+0.73%" },
    pool: 52300,
    entries: 295,
    timer: "3h 08m left",
  },
  {
    id: "3",
    category: "DeFi",
    board: "Live",
    duration: "15m",
    league: "DeFi Board",
    title: "LINK vs UNI",
    subtitle: "Fast DeFi round. Pick the stronger mover.",
    left: { ticker: "LINK", odds: 1.88, change: "+0.33%" },
    draw: { odds: 3.8, change: "Tie move" },
    right: { ticker: "UNI", odds: 1.83, change: "+0.41%" },
    pool: 19900,
    entries: 188,
    timer: "09m left",
  },
  {
    id: "4",
    category: "Meme",
    board: "Live",
    duration: "30m",
    league: "Meme Arena",
    title: "DOGE vs PEPE",
    subtitle: "Meme battle live now.",
    left: { ticker: "DOGE", odds: 1.91, change: "+2.13%" },
    draw: { odds: 4.45, change: "Tie move" },
    right: { ticker: "PEPE", odds: 1.85, change: "+1.98%" },
    pool: 27100,
    entries: 210,
    timer: "18m left",
  },
  {
    id: "5",
    category: "Major",
    board: "Upcoming",
    duration: "1D",
    league: "Crypto Majors",
    title: "XRP vs BNB",
    subtitle: "Daily battle opens shortly.",
    left: { ticker: "XRP", odds: 2.08, change: "Starts soon" },
    draw: { odds: 5.0, change: "Tie move" },
    right: { ticker: "BNB", odds: 1.66, change: "Starts soon" },
    pool: 48120,
    entries: 337,
    timer: "Starts in 22m",
  },
  {
    id: "6",
    category: "L2",
    board: "Upcoming",
    duration: "1h",
    league: "Layer 2 Board",
    title: "OP vs ARB",
    subtitle: "Upcoming L2 ecosystem clash.",
    left: { ticker: "OP", odds: 1.78, change: "Starts soon" },
    draw: { odds: 4.2, change: "Tie move" },
    right: { ticker: "ARB", odds: 1.96, change: "Starts soon" },
    pool: 21400,
    entries: 140,
    timer: "Starts in 11m",
  },
  {
    id: "7",
    category: "AI",
    board: "Live",
    duration: "1W",
    league: "AI Board",
    title: "RNDR vs FET",
    subtitle: "Weekly AI sector battle.",
    left: { ticker: "RNDR", odds: 1.97, change: "+1.44%" },
    draw: { odds: 4.6, change: "Tie move" },
    right: { ticker: "FET", odds: 1.84, change: "+1.01%" },
    pool: 31800,
    entries: 167,
    timer: "6d left",
  },
];

const mockProfile = {
  username: "SolDegen420",
  walletAddress: "9xQe...7kp2",
  joinDate: "March 28, 2026",
  tribe: "SOL Degens",
  totalBets: 127,
  wonBets: 73,
  lostBets: 48,
  voidBets: 6,
  winRate: "57.5%",
  totalWagered: "$12,450",
  totalWon: "$18,230",
  netProfit: "+$8,360",
};

function cx(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

function formatOdds(value: number) {
  return `${value.toFixed(2)}x`;
}

function calculateTotalOdds(selections: SlipSelection[]) {
  if (!selections.length) return 0;
  return selections.reduce((total, selection) => total * selection.oddsAtPick, 1);
}

function calculatePotentialPayout(stake: number, totalOdds: number) {
  if (!stake || !totalOdds) return 0;
  return stake * totalOdds;
}

function PredaStyles() {
  return (
    <style>{`
      .preda-scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      .preda-scrollbar-hide::-webkit-scrollbar {
        display: none;
      }
    `}</style>
  );
}

function TokenMark({ ticker }: { ticker: string }) {
  const src = coinIcons[ticker];
  if (!src) {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full border bg-white/5 text-[10px] font-semibold text-white"
        style={{ borderColor: COLORS.line }}
      >
        {ticker.slice(0, 1)}
      </div>
    );
  }
  return <img src={src} alt={ticker} className="h-6 w-6 rounded-full object-cover" />;
}

function LoadingOverlay({ loading }: { loading: boolean }) {
  return (
    <AnimatePresence>
      {loading ? (
        <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-[#040704]">
          <div className="text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border text-2xl font-bold"
              style={{ borderColor: COLORS.lineStrong, color: COLORS.accent, background: COLORS.accentSoft }}
            >
              P
            </motion.div>
            <p className="mt-4 text-sm tracking-[0.22em]" style={{ color: COLORS.textSoft }}>
              LOADING
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            className="w-full max-w-md overflow-hidden rounded-[28px] border bg-[#0a0f0a] shadow-2xl"
            style={{ borderColor: COLORS.lineStrong }}
          >
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: COLORS.line }}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: COLORS.accent }}>
                  PREDA Access
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">Wallet + Social Login</h3>
              </div>
              <button onClick={onClose} className="rounded-full border p-2 text-slate-400 transition hover:text-white" style={{ borderColor: COLORS.line }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-6 py-5">
              <AuthButton label="Continue with X / Twitter" badge="X" />
              <AuthButton label="Connect Phantom Wallet" icon={<Wallet className="h-4 w-4" />} />
              <AuthButton label="Connect Solflare Wallet" icon={<Wallet className="h-4 w-4" />} />
              <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
                Email, Google, and Apple are removed. X and crypto-social / wallet first access only.
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function AuthButton({
  label,
  icon,
  badge,
}: {
  label: string;
  icon?: React.ReactNode;
  badge?: string;
}) {
  return (
    <button className="flex w-full items-center justify-between rounded-2xl border bg-white/5 px-4 py-3 text-left transition hover:bg-white/[0.07]" style={{ borderColor: COLORS.line }}>
      <div className="flex items-center gap-3 text-sm font-medium text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border bg-black/20 text-slate-200" style={{ borderColor: COLORS.line }}>
          {icon || badge}
        </span>
        {label}
      </div>
      <ArrowRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}

function BreakingNewsPopup() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), 9000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-20 right-5 z-[60] w-full max-w-sm rounded-[24px] border bg-[#0b110b]/95 p-4 shadow-2xl backdrop-blur" style={{ borderColor: COLORS.lineStrong }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: COLORS.accentSoft, color: COLORS.accent }}>
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: COLORS.accent }}>
                  Serious Market Update
                </p>
                <p className="mt-1 text-sm font-medium text-white">BTC volatility spike detected ahead of major session open.</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full border p-2 text-slate-400" style={{ borderColor: COLORS.line }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DesktopHeader({
  expanded,
  onToggleSidebar,
  onOpenAuth,
  onLogoClick,
}: {
  expanded: boolean;
  onToggleSidebar: () => void;
  onOpenAuth: () => void;
  onLogoClick: () => void;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 hidden h-[72px] border-b bg-[#080c14]/92 backdrop-blur-xl lg:block" style={{ borderColor: COLORS.lineStrong }}>
      <div className="flex h-full items-center justify-between">
        <button onClick={onToggleSidebar} className={cx("flex h-full items-center gap-3 border-r px-4 text-left transition-all duration-300", expanded ? "w-[280px]" : "w-[86px]")} style={{ borderColor: COLORS.lineStrong }}>
          <motion.div
            whileHover={{ rotate: -6, scale: 1.04 }}
            onClick={(e) => {
              e.stopPropagation();
              onLogoClick();
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border text-sm font-bold"
            style={{ borderColor: COLORS.lineStrong, background: COLORS.accentSoft, color: COLORS.accent }}
          >
            P
          </motion.div>
          {expanded && <span className="text-lg font-semibold text-white">PREDA</span>}
        </button>

        <div className="flex items-center flex-1 px-5">
          <AuthSection />
        </div>
      </div>
    </header>
  );
}

function SidebarAccordion({
  expanded,
  openSection,
  setOpenSection,
  currentPath,
  onNavigate,
}: {
  expanded: boolean;
  openSection: string | null;
  setOpenSection: (value: string | null) => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <>
      {sidebarSections.map((section) => (
        <div key={section.title} className="mb-5">
          <button
            onClick={() => setOpenSection(openSection === section.title ? null : section.title)}
            className="mb-2 w-full text-left"
          >
            {expanded ? (
              <p className="px-2 text-[10px] uppercase tracking-[0.22em]" style={{ color: COLORS.textSoft }}>
                {section.title}
              </p>
            ) : (
              <p className="text-center text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textSoft }}>
                {section.title.slice(0, 1)}
              </p>
            )}
          </button>

          <AnimatePresence initial={false}>
            {openSection === section.title && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const active = currentPath === item.path;
                    return (
                      <button
                        key={item.label}
                        onClick={() => onNavigate(item.path)}
                        className="flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition hover:bg-white/[0.04]"
                        style={{
                          borderColor: active ? COLORS.lineStrong : COLORS.line,
                          background: active ? COLORS.accentSoft : "transparent",
                        }}
                      >
                        <span className={cx("text-sm", active ? "text-white" : "text-slate-300")}>
                          {expanded ? item.label : item.label.slice(0, 1)}
                        </span>
                        {expanded && item.soon ? (
                          <span className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em]" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
                            Soon
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </>
  );
}

function Toast() {
  const [toasts, setToasts] = React.useState<{id: number, message: string, type: string}[]>([])

  React.useEffect(() => {
    const handler = (e: any) => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, ...e.detail }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
    }
    window.addEventListener('toast', handler)
    return () => window.removeEventListener('toast', handler)
  }, [])

  return (
    <div className="fixed top-20 right-5 z-[100] flex flex-col gap-2">
      {toasts.map(toast => (
        <div key={toast.id} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl"
          style={{ 
            background: toast.type === 'success' ? COLORS.accent : '#ef4444',
            color: toast.type === 'success' ? '#000' : '#fff'
          }}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}

function UserBalancePanel() {
  const { publicKey, connected, sendTransaction } = useWallet()
  const [balance, setBalance] = React.useState<number>(0)
  const [solPrice, setSolPrice] = React.useState<number>(150)
  const [depositAmount, setDepositAmount] = React.useState('')
  const [withdrawAmount, setWithdrawAmount] = React.useState('')
  const [showDeposit, setShowDeposit] = React.useState(false)
  const [showWithdraw, setShowWithdraw] = React.useState(false)
  const [currency, setCurrency] = React.useState<'SOL' | 'USD'>('USD')
  const [loading, setLoading] = React.useState(false)

  const walletAddr = publicKey?.toBase58() || ''

  const fetchBalance = React.useCallback(async () => {
    try {
      const { supabase } = await import('./lib/supabase')
      const { data } = await supabase
        .from('user_balances')
        .select('balance_lamports')
        .eq('wallet_address', walletAddr)
        .single()
      if (data) setBalance(data.balance_lamports)
    } catch (err) {
      console.error('Failed to fetch balance:', err)
    }
  }, [walletAddr])

  React.useEffect(() => {
    if (!walletAddr) return
    fetchBalance()
    fetchSolPrice()
  }, [walletAddr, fetchBalance])

  React.useEffect(() => {
    const handler = () => fetchBalance()
    window.addEventListener('balance-refresh', handler)
    return () => window.removeEventListener('balance-refresh', handler)
  }, [fetchBalance])

  async function fetchSolPrice() {
    try {
      const res = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')
      const data = await res.json()
      const parsed = data?.parsed?.[0]
      if (parsed) {
        setSolPrice(Number(parsed.price.price) * Math.pow(10, parsed.price.expo))
      }
    } catch (err) {
      console.error('Failed to fetch SOL price:', err)
    }
  }

  async function handleDeposit() {
    if (!connected || !publicKey || !depositAmount) return
    setLoading(true)
    try {
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
      const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')
      
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('platform_vault')],
        PROGRAM_ID
      )

      const lamports = Math.floor(Number(depositAmount) * 1_000_000_000)
      
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: vaultPda,
          lamports,
        })
      )

      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, 'confirmed')

      // Update Supabase balance
      const { data: existing } = await supabase
        .from('user_balances')
        .select('id, balance_lamports, total_deposited')
        .eq('wallet_address', walletAddr)
        .single()

      if (existing) {
        await supabase.from('user_balances').update({
          balance_lamports: existing.balance_lamports + lamports,
          total_deposited: existing.total_deposited + lamports,
          updated_at: new Date().toISOString(),
        }).eq('wallet_address', walletAddr)
      } else {
        await supabase.from('user_balances').insert({
          wallet_address: walletAddr,
          balance_lamports: lamports,
          total_deposited: lamports,
        })
      }

      setBalance(prev => prev + lamports)
      setDepositAmount('')
      setShowDeposit(false)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: '✅ Deposit successful!', type: 'success' } }))
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: '❌ Deposit failed: ' + err.message, type: 'error' } }))
    } finally {
      setLoading(false)
    }
  }

  async function handleWithdraw() {
    if (!connected || !publicKey || !withdrawAmount) return
    setLoading(true)
    try {
      const lamports = Math.floor(Number(withdrawAmount) * 1_000_000_000)
      
      if (lamports > balance) {
        window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Insufficient balance', type: 'error' } }))
        return
      }

      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddr,
          amount_lamports: lamports,
        })
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }

      setBalance(prev => prev - lamports)
      setWithdrawAmount('')
      setShowWithdraw(false)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: '✅ Withdrawal successful!', type: 'success' } }))
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Withdrawal failed: ' + err.message, type: 'error' } }))
    } finally {
      setLoading(false)
    }
  }

  const balanceSol = balance / 1_000_000_000
  const balanceUsd = balanceSol * solPrice

  if (!connected) {
    return (
      <div className="rounded-2xl border p-3" style={{ borderColor: COLORS.line }}>
        <p className="text-sm font-medium text-white">User Profile</p>
        <p className="mt-1 text-xs" style={{ color: COLORS.textSoft }}>Connect wallet to see balance</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border p-3 space-y-3" style={{ borderColor: COLORS.line }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">User Profile</p>
        <button
          onClick={() => setCurrency(currency === 'USD' ? 'SOL' : 'USD')}
          className="text-xs px-2 py-1 rounded-full"
          style={{ background: COLORS.accentSoft, color: COLORS.accent }}
        >
          {currency}
        </button>
      </div>
      <p className="text-xs" style={{ color: COLORS.textSoft }}>
        {walletAddr.slice(0, 4)}...{walletAddr.slice(-4)}
      </p>
      <div className="rounded-xl p-2" style={{ background: COLORS.accentSoft }}>
        <p className="text-xs" style={{ color: COLORS.textSoft }}>Balance</p>
        <p className="text-lg font-bold" style={{ color: COLORS.accent }}>
          {currency === 'USD' ? `$${balanceUsd.toFixed(2)}` : `${balanceSol.toFixed(4)} SOL`}
        </p>
        <p className="text-xs" style={{ color: COLORS.textSoft }}>
          {currency === 'USD' ? `${balanceSol.toFixed(4)} SOL` : `$${balanceUsd.toFixed(2)}`}
        </p>
      </div>

      {showDeposit && (
        <div className="space-y-2">
          <input
            type="number"
            placeholder="Amount in SOL"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}` }}
          />
          <button
            onClick={handleDeposit}
            disabled={loading}
            className="w-full rounded-xl py-2 text-sm font-semibold text-black"
            style={{ background: COLORS.accent }}
          >
            {loading ? 'Processing...' : 'Confirm Deposit'}
          </button>
        </div>
      )}

      {showWithdraw && (
        <div className="space-y-2">
          <input
            type="number"
            placeholder="Amount in SOL"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}` }}
          />
          <button
            onClick={handleWithdraw}
            disabled={loading}
            className="w-full rounded-xl py-2 text-sm font-semibold text-black"
            style={{ background: COLORS.accent }}
          >
            {loading ? 'Processing...' : 'Confirm Withdraw'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setShowDeposit(!showDeposit); setShowWithdraw(false) }}
          className="rounded-xl py-2 text-xs font-semibold text-black"
          style={{ background: COLORS.accent }}
        >
          Deposit
        </button>
        <button
          onClick={() => { setShowWithdraw(!showWithdraw); setShowDeposit(false) }}
          className="rounded-xl py-2 text-xs font-semibold"
          style={{ background: COLORS.accentSoft, color: COLORS.accent, border: `1px solid ${COLORS.lineStrong}` }}
        >
          Withdraw
        </button>
      </div>
    </div>
  )
}

function DesktopSidebar({
  expanded,
  openSection,
  setOpenSection,
  onNavigate,
  currentPath,
}: {
  expanded: boolean;
  openSection: string | null;
  setOpenSection: (value: string | null) => void;
  onNavigate: (path: string) => void;
  currentPath: string;
}) {
  return (
    <aside className={cx("fixed bottom-0 left-0 top-[72px] z-40 hidden border-r bg-[#070b07] transition-all duration-300 lg:block", expanded ? "w-[280px]" : "w-[86px]")} style={{ borderColor: COLORS.lineStrong }}>
      <div className="preda-scrollbar-hide flex h-full flex-col justify-between overflow-y-auto px-3 py-4">
        <div>
          <SidebarAccordion expanded={expanded} openSection={openSection} setOpenSection={setOpenSection} currentPath={currentPath} onNavigate={onNavigate} />
        </div>

        <div className="space-y-3 border-t pt-4" style={{ borderColor: COLORS.line }}>
          {expanded ? (
            <UserBalancePanel />
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function MobileShell({
  open,
  setOpen,
  onOpenAuth,
  onNavigate,
  openSection,
  setOpenSection,
  currentPath,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onOpenAuth: () => void;
  onNavigate: (path: string) => void;
  openSection: string | null;
  setOpenSection: (value: string | null) => void;
  currentPath: string;
}) {
  return (
    <>
      <div className="sticky top-0 z-50 flex h-[68px] items-center justify-between border-b bg-[#080c14]/92 px-4 backdrop-blur-xl lg:hidden" style={{ borderColor: COLORS.lineStrong }}>
        <button onClick={() => setOpen(true)} className="rounded-xl border p-2 text-white" style={{ borderColor: COLORS.line }}>
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border text-sm font-bold" style={{ borderColor: COLORS.lineStrong, background: COLORS.accentSoft, color: COLORS.accent }}>
            P
          </div>
          <span className="text-base font-semibold text-white">PREDA</span>
        </div>
        <button onClick={onOpenAuth} className="rounded-xl px-3 py-2 text-xs font-semibold text-black" style={{ background: COLORS.accent }}>
          Connect
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/70 lg:hidden">
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} className="h-full w-[300px] border-r bg-[#070b07]" style={{ borderColor: COLORS.lineStrong }}>
              <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: COLORS.line }}>
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border text-sm font-bold" style={{ borderColor: COLORS.lineStrong, background: COLORS.accentSoft, color: COLORS.accent }}>
                    P
                  </div>
                  <span className="text-base font-semibold text-white">PREDA</span>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-xl border p-2 text-white" style={{ borderColor: COLORS.line }}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="preda-scrollbar-hide h-[calc(100%-73px)] overflow-y-auto px-3 py-4">
                <SidebarAccordion
                  expanded={true}
                  openSection={openSection}
                  setOpenSection={setOpenSection}
                  currentPath={currentPath}
                  onNavigate={(path) => {
                    onNavigate(path);
                    setOpen(false);
                  }}
                />
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Showboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [current, setCurrent] = useState(0);
  const slide = showSlides[current];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % showSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="px-4 pt-6 sm:px-6 xl:px-8">
      <div className="relative overflow-hidden rounded-[28px] border bg-[linear-gradient(135deg,rgba(11,33,11,0.96),rgba(5,12,5,0.98))] px-6 py-7 sm:px-8" style={{ borderColor: COLORS.lineStrong }}>
        <div className="absolute inset-y-0 left-0 w-32 bg-[radial-gradient(circle_at_left,rgba(0,212,255,0.10),transparent_62%)]" />
        <div className="absolute inset-y-0 right-0 w-32 bg-[radial-gradient(circle_at_right,rgba(141,255,79,0.10),transparent_62%)]" />

        <div className="relative flex items-center justify-between gap-6">
          <button onClick={() => setCurrent((prev) => (prev - 1 + showSlides.length) % showSlides.length)} className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border sm:flex" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div key={slide.title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.28 }}>
                <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: COLORS.accent }}>
                  {slide.title}
                </p>
                <p className="mt-3 max-w-4xl text-lg font-semibold text-white sm:text-2xl">{slide.text}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button onClick={() => onNavigate("/")} className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-black" style={{ background: COLORS.accent }}>
                    {slide.cta}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
                    Built by humans and AI
                  </span>
                  <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
                    Coming to Solana
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <button onClick={() => setCurrent((prev) => (prev + 1) % showSlides.length)} className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border sm:flex" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function Filters({
  selectedBoard,
  setSelectedBoard,
  selectedClass,
  setSelectedClass,
}: {
  selectedBoard: MatchBoard;
  setSelectedBoard: (v: MatchBoard) => void;
  selectedClass: string;
  setSelectedClass: (v: string) => void;
}) {
  return (
    <div className="space-y-4 border-b px-5 py-5 sm:px-6" style={{ borderColor: COLORS.line }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {boardTabs.map((tab) => (
            <button key={tab} onClick={() => setSelectedBoard(tab)} className={cx("rounded-full px-4 py-2 text-sm font-medium", selectedBoard === tab ? "text-black" : "text-white")} style={selectedBoard === tab ? { background: COLORS.accent } : { border: `1px solid ${COLORS.line}`, background: "rgba(255,255,255,0.03)" }}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button key="All" onClick={() => setSelectedClass("All")} className={cx("rounded-full px-3 py-2 text-sm font-medium", selectedClass === "All" ? "text-black" : "text-white")} style={selectedClass === "All" ? { background: COLORS.accent } : { border: `1px solid ${COLORS.line}`, background: "rgba(255,255,255,0.03)" }}>
            All
          </button>

          {classTabs.map((tab) => (
            <button key={tab} onClick={() => setSelectedClass(tab)} className={cx("rounded-full px-3 py-2 text-sm font-medium", selectedClass === tab ? "text-black" : "text-white")} style={selectedClass === tab ? { background: COLORS.accent } : { border: `1px solid ${COLORS.line}`, background: "rgba(255,255,255,0.03)" }}>
              {tab}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectionButton({
  active,
  label,
  odds,
  meta,
  ticker,
}: {
  active: boolean;
  label: string;
  odds: number;
  meta: string;
  ticker: string;
}) {
  return (
    <motion.div whileHover={{ y: -2, scale: 1.01 }} transition={{ duration: 0.16 }} className={cx("rounded-[20px] border px-3 py-3 text-left transition", active ? "ring-1" : "")} style={{ borderColor: active ? COLORS.lineStrong : COLORS.line, background: active ? COLORS.accentSoft : "rgba(255,255,255,0.03)", boxShadow: active ? `0 0 0 1px ${COLORS.accentGlow} inset` : "none" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center justify-between w-full gap-3">
          {ticker === "DRAW" ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold text-white" style={{ borderColor: COLORS.line }}>
              D
            </div>
          ) : (
            <TokenMark ticker={ticker} />
          )}
          <div>
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="mt-1 text-[11px]" style={{ color: COLORS.textSoft }}>
              {meta}
            </p>
          </div>
        </div>
        <span className="text-sm font-semibold" style={{ color: COLORS.accent }}>
          {formatOdds(odds)}
        </span>
      </div>
    </motion.div>
  );
}

function MarketCard({
  match,
  selectedSide,
  onPick,
}: {
  match: Match;
  selectedSide: Side | null;
  onPick: (match: Match, side: Side) => void;
}) {
  const [chartOpen, setChartOpen] = React.useState(false)
  return (
    <>
    <PriceChartModal
      open={chartOpen}
      onClose={() => setChartOpen(false)}
      coinA={match.left.ticker}
      coinB={match.right.ticker}
      startTime={match.startTime}
      startPriceA={match.startPriceA}
      startPriceB={match.startPriceB}
    />
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }} transition={{ duration: 0.18 }} className="rounded-[24px] border bg-[#0b110b] p-5" style={{ borderColor: COLORS.lineStrong }}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.textSoft }}>
              {match.league}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: match.board === "Live" ? "rgba(16,185,129,0.12)" : "rgba(250,204,21,0.12)", color: match.board === "Live" ? "#86efac" : "#fde68a" }}>
                {match.board}
              </span>
              <span className="rounded-full border px-3 py-1 text-xs text-white" style={{ borderColor: COLORS.line }}>
                3-Way
              </span>
              <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS.line, color: COLORS.accent }}>
                {match.duration}
              </span>
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">{match.title}</h3>
            <p className="mt-1 text-sm" style={{ color: COLORS.textSoft }}>
              {match.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <StatBox label="Pool" value={`$${match.pool.toLocaleString()}`} />
            <StatBox label="Entries" value={String(match.entries)} />
            <StatBox label="Timer" value={match.timer} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button onClick={() => onPick(match, "left")}>
            <SelectionButton active={selectedSide === "left"} label={match.left.ticker} odds={match.left.odds} meta={match.left.change} ticker={match.left.ticker} />
          </button>
          <button onClick={() => onPick(match, "draw")}>
            <SelectionButton active={selectedSide === "draw"} label="Draw" odds={match.draw.odds} meta={match.draw.change} ticker="DRAW" />
          </button>
          <button onClick={() => onPick(match, "right")}>
            <SelectionButton active={selectedSide === "right"} label={match.right.ticker} odds={match.right.odds} meta={match.right.change} ticker={match.right.ticker} />
          </button>
        </div>
        <button onClick={() => setChartOpen(true)} className="w-full mt-1 rounded-xl py-2 text-xs font-medium flex items-center justify-center gap-2" style={{ border: `1px solid rgba(0,240,255,0.2)`, color: "#00f0ff", background: "rgba(0,240,255,0.05)" }}>
          📈 View Settlement Chart
        </button>
      </div>
    </motion.div>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-black/20 px-3 py-3" style={{ borderColor: COLORS.line }}>
      <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textSoft }}>
        {label}
      </p>
      <p className="mt-2 font-medium text-white">{value}</p>
    </div>
  );
}

function SlipHandle({
  open,
  setOpen,
  count,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  count: number;
}) {
  return (
    <motion.button
      onClick={() => setOpen(!open)}
      animate={count > 0 && !open ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 1.4, repeat: count > 0 && !open ? Infinity : 0, ease: "easeInOut" }}
      className="fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 rounded-2xl border px-3 py-3 text-sm font-semibold text-white shadow-xl lg:block"
      style={{ borderColor: COLORS.lineStrong, background: open ? COLORS.panel : COLORS.accentSoft }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: open ? "white" : COLORS.accent }}>Slip</span>
        <span className="rounded-full px-2 py-0.5 text-xs text-black" style={{ background: COLORS.accent }}>
          {count}
        </span>
      </div>
    </motion.button>
  );
}

function SlipDrawer({
  open,
  items,
  stake,
  setStake,
  onRemove,
  onPlaceTicket,
  onClose,
}: {
  open: boolean;
  items: SlipSelection[];
  stake: string;
  setStake: (v: string) => void;
  onRemove: (matchId: string) => void;
  onPlaceTicket: () => void;
  onClose: () => void;
}) {
  const totalOdds = useMemo(() => calculateTotalOdds(items), [items]);
  const projected = useMemo(() => calculatePotentialPayout(Number(stake || 0), totalOdds), [stake, totalOdds]);

  return (
    <motion.aside
      animate={{ x: open ? 0 : 420, opacity: open ? 1 : 0.96 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="fixed bottom-20 right-5 top-[92px] z-[45] w-[380px] overflow-hidden rounded-[30px] border bg-[#0b110b] shadow-2xl"
      style={{ borderColor: COLORS.lineStrong }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-4" style={{ background: COLORS.accent }}>
          <div className="flex items-center gap-3 text-black">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/10">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold">My Slip</p>
              <p className="text-xs text-black/70">{items.length} selections</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/80">AUTO</div>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10">
              <X className="h-4 w-4 text-black" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 text-sm">
          {["Single", "Combo", "System"].map((tab) => {
            const active = items.length <= 1 ? "Single" : "Combo";
            const disabled = tab === "System";
            return (
              <div key={tab} className="border-b px-3 py-3 text-center font-medium" style={{ borderColor: active === tab ? COLORS.accent : COLORS.line, color: disabled ? "#4e5e49" : active === tab ? COLORS.accent : COLORS.textSoft }}>
                {tab}
              </div>
            );
          })}
        </div>

        <div className="preda-scrollbar-hide min-h-0 flex-1 overflow-y-auto">
          {items.length ? (
            items.map((item) => (
              <div key={item.matchId} className="flex gap-3 border-b bg-white/[0.02] px-3 py-4" style={{ borderColor: COLORS.line }}>
                <button onClick={() => onRemove(item.matchId)} className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-slate-400" style={{ borderColor: COLORS.line }}>
                  <X className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{item.pickLabel}</p>
                  <p className="mt-1 text-sm" style={{ color: COLORS.textSoft }}>
                    {item.matchTitle}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.16em]" style={{ color: COLORS.textSoft }}>
                    3-Way · {item.duration}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold" style={{ color: COLORS.accent }}>
                    {formatOdds(item.oddsAtPick)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="font-medium text-white">Your slip is empty</p>
              <p className="mt-2 text-sm leading-6" style={{ color: COLORS.textSoft }}>
                Pick left, draw, or right and your selections stack here automatically.
              </p>
            </div>
          )}

          <div className="border-t px-4 py-4" style={{ borderColor: COLORS.line }}>
            <div className="flex items-center gap-2 rounded-2xl border bg-black/20 px-4 py-3" style={{ borderColor: COLORS.line }}>
              <CircleDollarSign className="h-4 w-4" style={{ color: COLORS.textSoft }} />
              <input value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" placeholder="Enter stake" />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {quickStakes.map((size) => (
                <button key={size} onClick={() => setStake(String(size))} className="rounded-xl border px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.04]" style={{ borderColor: COLORS.line }}>
                  {size}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between" style={{ color: COLORS.textSoft }}>
                <span>Total Odds</span>
                <span className="font-medium text-white">{items.length ? formatOdds(totalOdds) : "--"}</span>
              </div>
              <div className="flex items-center justify-between" style={{ color: COLORS.textSoft }}>
                <span>Total Bet</span>
                <span className="font-medium text-white">{stake ? `$${stake}` : "--"}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-base font-semibold text-white">Potential Win</span>
                <span className="text-lg font-semibold" style={{ color: COLORS.accent }}>
                  {items.length ? `$${projected.toFixed(2)}` : "--"}
                </span>
              </div>
            </div>

            <button disabled={!items.length} onClick={onPlaceTicket} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40" style={{ background: COLORS.accent }}>
              Place Ticket
            </button>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

function BottomNav({
  onNavigate,
  onOpenSlip,
}: {
  onNavigate: (path: string) => void;
  onOpenSlip: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-black/95 px-2 py-2 backdrop-blur lg:hidden" style={{ borderColor: COLORS.lineStrong }}>
      <div className="flex items-center justify-around text-xs text-white">
        <button onClick={() => onNavigate("/profile")} className="px-2 py-2">Profile</button>
        <button onClick={onOpenSlip} className="px-2 py-2">Betslip</button>
        <button onClick={() => onNavigate("/running")} className="px-2 py-2">Running</button>
        <button onClick={() => onNavigate("/history")} className="px-2 py-2">History</button>
        <button onClick={() => onNavigate("/")} className="px-2 py-2">Home</button>
      </div>
    </div>
  );
}

function PlaceholderPage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[30px] border bg-[#0a0f0a] p-6" style={{ borderColor: COLORS.lineStrong }}>
      <h2 className="text-3xl font-semibold text-white">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: COLORS.textSoft }}>
        {body}
      </p>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="rounded-[30px] border bg-[#0a0f0a] p-6" style={{ borderColor: COLORS.lineStrong }}>
      <h2 className="text-3xl font-semibold text-white">Profile</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <InfoCard label="Username" value={mockProfile.username} />
        <InfoCard label="Wallet" value={mockProfile.walletAddress} />
        <InfoCard label="Join Date" value={mockProfile.joinDate} />
        <InfoCard label="Tribe" value={mockProfile.tribe} />
        <InfoCard label="Total Bets" value={String(mockProfile.totalBets)} />
        <InfoCard label="Won Bets" value={String(mockProfile.wonBets)} />
        <InfoCard label="Lost Bets" value={String(mockProfile.lostBets)} />
        <InfoCard label="Void Bets" value={String(mockProfile.voidBets)} />
        <InfoCard label="Win Rate" value={mockProfile.winRate} />
        <InfoCard label="Total Wagered" value={mockProfile.totalWagered} />
        <InfoCard label="Total Won" value={mockProfile.totalWon} />
        <InfoCard label="Net Profit" value={mockProfile.netProfit} />
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-black/20 p-4" style={{ borderColor: COLORS.line }}>
      <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.textSoft }}>
        {label}
      </p>
      <p className="mt-2 font-medium text-white">{value}</p>
    </div>
  );
}

function Footer({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="mt-12 border-t bg-black/20" style={{ borderColor: COLORS.line }}>
      <div className="mx-auto grid max-w-[1700px] gap-8 px-4 py-10 sm:px-6 xl:grid-cols-[1.2fr_1fr_1fr] xl:px-8">
        <div>
          <p className="text-2xl font-semibold text-white">PREDA</p>
          <p className="mt-3 max-w-lg text-sm leading-7" style={{ color: COLORS.textSoft }}>
            <span className="font-medium text-white">First crypto competition market.</span>{" "}
            Battle coins, build parlays, and set records.
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border px-3 py-1 text-white" style={{ borderColor: COLORS.line }}>
              Built by humans and AI
            </span>
            <span className="rounded-full border px-3 py-1" style={{ borderColor: COLORS.line, color: COLORS.accent }}>
              Coming to Solana
            </span>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white">Product</p>
          <div className="mt-3 space-y-2 text-sm" style={{ color: COLORS.textSoft }}>
            <button onClick={() => onNavigate("/")} className="block transition hover:text-white">Arena</button>
            <button onClick={() => onNavigate("/news")} className="block transition hover:text-white">News</button>
            <button onClick={() => onNavigate("/leaderboard")} className="block transition hover:text-white">Leaderboard</button>
            <button onClick={() => onNavigate("/how-to-play")} className="block transition hover:text-white">How to Play</button>
            <button onClick={() => onNavigate("/support")} className="block transition hover:text-white">Support</button>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white">Community</p>
          <div className="mt-3 space-y-2 text-sm" style={{ color: COLORS.textSoft }}>
            <a href="https://x.com" target="_blank" rel="noreferrer" className="block transition hover:text-white">X / Twitter</a>
            <a href="https://discord.com" target="_blank" rel="noreferrer" className="block transition hover:text-white">Discord</a>
            <a href="https://t.me" target="_blank" rel="noreferrer" className="block transition hover:text-white">Telegram</a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="block transition hover:text-white">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function AuthSection() {
  const { login, authenticated, user, logout } = usePrivy();




  return (
    <div className="flex items-center justify-between w-full px-2">
      {/* LEFT GROUP */}
      <div className="flex items-center gap-2">
        {!authenticated ? (
          <button
            onClick={login}
            className="px-5 py-2 rounded-full text-black font-semibold text-sm transition-opacity hover:opacity-80"
            style={{ background: "#00d4ff" }}
          >
            Login with X
          </button>
        ) : (
          <div className="text-cyan-400 text-sm font-medium">
            @{user?.twitter?.username || "User"}
          </div>
        )}



        {authenticated && (
          <button
            onClick={logout}
            className="px-4 py-2 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(0,212,255,0.08)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}
          >
            Logout
          </button>
        )}
      </div>

      {/* RIGHT GROUP */}
      <div className="flex items-center gap-3">
        <WalletMultiButton style={{ borderRadius: "9999px", background: "#00d4ff", color: "#000", fontWeight: 600, fontSize: "14px" }} />
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _PredaAuthControls({
  accentColor = "#00d4ff",
}: {
  accentColor?: string;
}) {
  const { login, authenticated, user, logout } = usePrivy();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;


  const walletAddress = connected && publicKey ? publicKey.toBase58() : "";
  const twitterUsername =
    authenticated && user?.twitter?.username ? user.twitter.username : "";
    

  return (
    <div className="flex items-center justify-between w-full gap-3">
      {!authenticated ? (
        <button
          onClick={() => login()}
          className="rounded-2xl px-4 py-2 text-sm font-semibold text-black"
          style={{ background: accentColor }}
        >
          Login with X
        </button>
      ) : (
        <div className="text-sm text-white">
          {twitterUsername || "Connected"}
        </div>
      )}

      <WalletMultiButton style={{ borderRadius: "9999px", background: "#00d4ff", color: "#000", fontWeight: 600, fontSize: "14px" }} />

      {walletAddress ? (
        <div className="text-xs text-gray-400">
          {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
        </div>
      ) : null}

      {authenticated ? (
        <button
          onClick={() => logout()}
          className="rounded-2xl border px-3 py-2 text-sm text-white"
          style={{ borderColor: accentColor }}
        >
          Logout
        </button>
      ) : null}
    </div>
  );
}

function RunningTicketCard({ ticket }: { ticket: any }) {
  const battle = ticket.battles
  const [timeLeft, setTimeLeft] = React.useState('')

  React.useEffect(() => {
    if (!battle?.end_time) { setTimeLeft('Unknown'); return }
    function calcTime() {
      const end = new Date(battle.end_time)
      const now = new Date()
      const diff = end.getTime() - now.getTime()
      if (diff <= 0) { setTimeLeft('Settling soon...'); return }
      const hrs = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setTimeLeft(hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`)
    }
    calcTime()
    const interval = setInterval(calcTime, 1000)
    return () => clearInterval(interval)
  }, [battle?.end_time])

  if (!battle) return null

  const potentialWin = (ticket.stake * ticket.odds).toFixed(2)
  const pick = ticket.side === 1 ? battle?.coin_a : ticket.side === 2 ? battle?.coin_b : 'Draw'

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: COLORS.lineStrong, background: COLORS.panel }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-white font-semibold text-lg">{battle?.coin_a} vs {battle?.coin_b}</p>
          <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>{battle?.league} · {battle?.duration}</p>
        </div>
        <div className="text-right">
          <div className="text-xs px-3 py-1 rounded-full font-semibold mb-1" style={{ background: `${COLORS.accent}22`, color: COLORS.accent }}>
            ⏱ {timeLeft}
          </div>
          <div className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#22c55e22', color: '#22c55e' }}>
            Live
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>Your Pick</p>
          <p className="text-white font-semibold">{pick}</p>
          <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>@ {ticket.odds}x</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>Stake</p>
          <p className="text-white font-semibold">${ticket.stake}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>To Win</p>
          <p className="font-semibold" style={{ color: COLORS.accent }}>${potentialWin}</p>
        </div>
      </div>
    </div>
  )
}

function HistoryPage({ walletAddress }: { walletAddress: string }) {
  const [tickets, setTickets] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!walletAddress) { setLoading(false); return }
    async function fetchHistory() {
      try {
        const { supabase } = await import('./lib/supabase')
        const { data } = await supabase
          .from('tickets')
          .select('*, battles(*)')
          .eq('wallet_address', walletAddress)
          .order('created_at', { ascending: false })
        setTickets((data || []).filter((t: any) => t.battles?.status === 'settled'))
      } catch (err) {
        console.error('Failed to fetch history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [walletAddress])

  if (!walletAddress) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-white text-lg font-semibold">Connect your wallet to see history</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p style={{ color: COLORS.textSoft }}>Loading history...</p>
    </div>
  )

  if (!tickets.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-white text-lg font-semibold">No settled bets yet</p>
      <p className="mt-2 text-sm" style={{ color: COLORS.textSoft }}>Your completed battles will appear here</p>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 xl:px-8">
      <h2 className="text-2xl font-bold text-white mb-6">Bet History</h2>
      <div className="grid gap-4">
        {tickets.map((ticket) => {
          const battle = ticket.battles
          const won = battle?.winner === ticket.side
          const potentialWin = (ticket.stake * ticket.odds).toFixed(2)
          const changeA = battle?.start_price_a && battle?.final_price_a 
            ? (((battle.final_price_a - battle.start_price_a) / battle.start_price_a) * 100).toFixed(2)
            : null
          const changeB = battle?.start_price_b && battle?.final_price_b
            ? (((battle.final_price_b - battle.start_price_b) / battle.start_price_b) * 100).toFixed(2)
            : null

          return (
            <div key={ticket.id} className="rounded-2xl border p-4" style={{ borderColor: COLORS.lineStrong, background: COLORS.panel }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-white font-semibold text-lg">{battle?.coin_a} vs {battle?.coin_b}</p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>{battle?.league} · {battle?.duration}</p>
                </div>
                <span className="text-sm px-3 py-1 rounded-full font-semibold" style={{
                  background: won ? `${COLORS.accent}22` : '#ef444422',
                  color: won ? COLORS.accent : '#ef4444'
                }}>
                  {won ? '🏆 Won' : '❌ Lost'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
                  <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>Your Pick</p>
                  <p className="text-white font-semibold">
                    {ticket.side === 1 ? battle?.coin_a : ticket.side === 2 ? battle?.coin_b : 'Draw'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>@ {ticket.odds}x</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
                  <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>{won ? 'Won' : 'Lost'}</p>
                  <p className="font-semibold" style={{ color: won ? COLORS.accent : '#ef4444' }}>
                    {won ? `+$${potentialWin}` : `-$${ticket.stake}`}
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>Stake: ${ticket.stake}</p>
                </div>
              </div>

              {(changeA || changeB) && (
                <div className="rounded-xl p-3 grid grid-cols-2 gap-3" style={{ background: COLORS.accentSoft }}>
                  <div>
                    <p className="text-xs" style={{ color: COLORS.textSoft }}>{battle?.coin_a} move</p>
                    <p className="font-semibold text-sm mt-1" style={{ color: Number(changeA) >= 0 ? '#4ade80' : '#ef4444' }}>
                      {Number(changeA) >= 0 ? '+' : ''}{changeA}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: COLORS.textSoft }}>{battle?.coin_b} move</p>
                    <p className="font-semibold text-sm mt-1" style={{ color: Number(changeB) >= 0 ? '#4ade80' : '#ef4444' }}>
                      {Number(changeB) >= 0 ? '+' : ''}{changeB}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RunningBetsPage({ walletAddress }: { walletAddress: string }) {
  const [tickets, setTickets] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!walletAddress) {
      setLoading(false)
      return
    }
    async function fetchTickets() {
      try {
        const { supabase } = await import('./lib/supabase')
        const { data } = await supabase
          .from('tickets')
          .select('*, battles(*)')
          .eq('wallet_address', walletAddress)
          .not('battles.status', 'eq', 'settled')
          .order('created_at', { ascending: false })
        setTickets((data || []).filter((t: any) => t.battles && t.battles?.status !== 'settled' && t.battles?.coin_a))
      } catch (err) {
        console.error('Failed to fetch tickets:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchTickets()
    const interval = setInterval(fetchTickets, 30000)
    return () => clearInterval(interval)
  }, [walletAddress])

  if (!walletAddress) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-white text-lg font-semibold">Connect your wallet to see your bets</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p style={{ color: COLORS.textSoft }}>Loading bets...</p>
    </div>
  )

  if (!tickets.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-white text-lg font-semibold">No bets yet</p>
      <p className="mt-2 text-sm" style={{ color: COLORS.textSoft }}>Place your first bet on the Arena</p>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 xl:px-8">
      <h2 className="text-2xl font-bold text-white mb-6">My Bets</h2>
      <div className="grid gap-4">
        {tickets.map((ticket) => (
            <RunningTicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </div>
  )
}

export default function PredaLandingDashboardMockup() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("ARENA");
  const [slipOpen, setSlipOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<MatchBoard>("Live");
  const [selectedClass, setSelectedClass] = useState("All");
  const [stake, setStake] = useState("100");
  const [slipSelections, setSlipSelections] = useState<SlipSelection[]>([]);
  const { matches: supabaseMatches } = useBattles();
  const [liveMatches, setLiveMatches] = useState<Match[]>(initialMatches);
  const wallet = useWallet();
  const { publicKey, connected } = wallet;


  useEffect(() => {
    if (supabaseMatches.length > 0) {
      setLiveMatches(supabaseMatches as any)
    }
  }, [supabaseMatches]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const routeToOpenSection: Record<string, string> = {
      "/": "ARENA",
      "/economy": "ARENA",
      "/sports": "ARENA",
      "/fanduel": "ARENA",
      "/running": "MY BETS",
      "/history": "MY BETS",
      "/news": "PRODUCT",
      "/leaderboard": "PRODUCT",
      "/how-to-play": "PRODUCT",
      "/support": "PRODUCT",
      "/markets/5m": "MARKETS",
      "/markets/15m": "MARKETS",
      "/markets/30m": "MARKETS",
      "/markets/1h": "MARKETS",
      "/markets/4h": "MARKETS",
      "/markets/1d": "MARKETS",
      "/markets/1w": "MARKETS",
      "/markets/1m": "MARKETS",
      "/markets/1y": "MARKETS",
    };

    if (routeToOpenSection[location.pathname]) {
      setOpenSection(routeToOpenSection[location.pathname]);
    }
  }, [location.pathname]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveMatches((prev) =>
        prev.map((match) => ({
          ...match,
          left: {
            ...match.left,
            odds: Math.max(1.1, Number((match.left.odds + (Math.random() - 0.5) * 0.08).toFixed(2))),
          },
          right: {
            ...match.right,
            odds: Math.max(1.1, Number((match.right.odds + (Math.random() - 0.5) * 0.08).toFixed(2))),
          },
        }))
      );
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (slipSelections.length > 0) {
      setSlipOpen(true);
    }
  }, [slipSelections.length]);

  useEffect(() => {
    if (slipOpen && slipSelections.length > 0) {
      const timer = setTimeout(() => {
        setSlipOpen(false);
      }, 30000);

      return () => clearTimeout(timer);
    }
  }, [slipOpen, slipSelections]);


  const visibleMatches = useMemo(() => {
    const routeDurationMap: Record<string, string> = {
      "/markets/5m": "5m",
      "/markets/15m": "15m",
      "/markets/30m": "30m",
      "/markets/1h": "1h",
      "/markets/4h": "4h",
      "/markets/1d": "1D",
      "/markets/1w": "1W",
      "/markets/1m": "1M",
      "/markets/1y": "1Y",
    };
    return liveMatches.filter((match) => {
      const boardMatch = match.board === selectedBoard;
      const classMatch = selectedClass === "All" || match.category === selectedClass;
      const durationFromRoute = routeDurationMap[location.pathname];
      const durationMatch = durationFromRoute ? match.duration === durationFromRoute : true;

      return boardMatch && classMatch && durationMatch;
    });
  }, [liveMatches, selectedBoard, selectedClass, location.pathname]);

  const handlePick = (match: Match, side: Side) => {
    let oddsAtPick = 0;
    let pickLabel = "";

    if (side === "left") {
      oddsAtPick = match.left.odds;
      pickLabel = match.left.ticker;
    } else if (side === "right") {
      oddsAtPick = match.right.odds;
      pickLabel = match.right.ticker;
    } else {
      oddsAtPick = match.draw.odds;
      pickLabel = "Draw";
    }

    setSlipSelections((prev) => {
      const existing = prev.find((item) => item.matchId === match.id);

      if (existing && existing.chosenSide === side) {
        return prev.filter((item) => item.matchId !== match.id);
      }

      const nextSelection: SlipSelection = {
        matchId: match.id,
        matchTitle: match.title,
        chosenSide: side,
        pickLabel,
        oddsAtPick,
        duration: match.duration,
      };

      return [...prev.filter((item) => item.matchId !== match.id), nextSelection];
    });
  };

  const handleRemoveSelection = (matchId: string) => {
    setSlipSelections((prev) => prev.filter((item) => item.matchId !== matchId));
  };

  const getSelectedSide = (matchId: string): Side | null => {
    const selection = slipSelections.find((item) => item.matchId === matchId);
    return selection ? selection.chosenSide : null;
  };

  const renderPageContent = () => {
    switch (location.pathname) {
      case "/news":
        return <PlaceholderPage title="News" body="Market news page. Serious updates, crypto headlines, and later economy and sports coverage." />;
      case "/leaderboard":
        return <PlaceholderPage title="Leaderboard" body="Top users, biggest wins, active streaks, and most consistent performers will show here." />;
      case "/how-to-play":
        return <PlaceholderPage title="How to Play" body="Pick left, draw, or right. Build parlays. Relative performance over the selected period decides the winner." />;
      case "/support":
        return <PlaceholderPage title="Support" body="Help center, FAQs, contact, and user support tools will live here." />;
      case "/profile":
        return <ProfilePage />;
      case "/running":
        return <RunningBetsPage walletAddress={connected && publicKey ? publicKey.toBase58() : ""} />;
      case "/history":
        return <HistoryPage walletAddress={connected && publicKey ? publicKey.toBase58() : ""} />;
      default:
        return (
          <section className="overflow-hidden rounded-[30px] border bg-[#0a0f0a]" style={{ borderColor: COLORS.lineStrong }}>
            <div className="px-5 pt-6 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-3xl font-semibold text-white">Arena</h2>
                  <p className="mt-2 text-sm" style={{ color: COLORS.textSoft }}>
                    Full market selections with live and upcoming coin battles.
                  </p>
                </div>
                <div className="hidden rounded-full border px-3 py-2 text-xs sm:block" style={{ borderColor: COLORS.line, color: COLORS.accent }}>
                  Hidden Slip Drawer Active
                </div>
              </div>
            </div>

            <Filters selectedBoard={selectedBoard} setSelectedBoard={setSelectedBoard} selectedClass={selectedClass} setSelectedClass={setSelectedClass} />

            <div className="grid gap-4 px-5 py-6 sm:px-6 xl:grid-cols-2">
              {visibleMatches.length ? (
                visibleMatches.map((match) => (
                  <MarketCard key={match.id} match={match} selectedSide={getSelectedSide(match.id)} onPick={handlePick} />
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed p-8 text-center xl:col-span-2" style={{ borderColor: COLORS.line }}>
                  <p className="text-lg font-medium text-white">No markets in this filter right now.</p>
                  <p className="mt-2 text-sm" style={{ color: COLORS.textSoft }}>
                    Switch board, token class, or market category.
                  </p>
                </div>
              )}
            </div>
          </section>
        );
    }
  };

  const handlePlaceTicket = async () => {
    if (!slipSelections.length) return
    if (!connected || !publicKey) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Connect your wallet first', type: 'error' } }))
      return
    }
    const walletAddr = publicKey.toBase58()
    const totalStake = Number(stake)

    try {
      const { supabase } = await import('./lib/supabase')

      // Fetch real SOL price
      let solPriceUsd = 100
      try {
        const priceRes = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d')
        const priceData = await priceRes.json()
        const parsed = priceData?.parsed?.[0]
        if (parsed) solPriceUsd = Number(parsed.price.price) * Math.pow(10, parsed.price.expo)
      } catch(e) {}

      // Check balance
      const { data: balData } = await supabase
        .from('user_balances')
        .select('balance_lamports')
        .eq('wallet_address', walletAddr)
        .single()

      const stakeInLamports = Math.floor((totalStake / solPriceUsd) * 1_000_000_000)

      if (!balData || balData.balance_lamports < stakeInLamports) {
        window.dispatchEvent(new CustomEvent('toast', { detail: { message: `Insufficient balance. Deposit more SOL to continue.`, type: 'error' } }))
        return
      }

      // Insert tickets
      for (const selection of slipSelections) {
        const side = selection.chosenSide === 'left' ? 1 : selection.chosenSide === 'right' ? 2 : 3
        await supabase.from('tickets').insert({
          battle_id: selection.matchId,
          wallet_address: walletAddr,
          side,
          stake: totalStake,
          odds: selection.oddsAtPick,
        })
      }

      // Deduct balance
      await supabase.from('user_balances')
        .update({ 
          balance_lamports: balData.balance_lamports - stakeInLamports,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_address', walletAddr)

      // Update battle pools and entries
      for (const selection of slipSelections) {
        const side = selection.chosenSide === 'left' ? 1 : selection.chosenSide === 'right' ? 2 : 3
        const { data: battleData } = await supabase
          .from('battles')
          .select('side_a_pool, side_b_pool, draw_pool, total_pool')
          .eq('id', selection.matchId)
          .single()

        if (battleData) {
          const updates: any = {
            total_pool: (battleData.total_pool || 0) + totalStake,
          }
          if (side === 1) updates.side_a_pool = (battleData.side_a_pool || 0) + totalStake
          else if (side === 2) updates.side_b_pool = (battleData.side_b_pool || 0) + totalStake
          else updates.draw_pool = (battleData.draw_pool || 0) + totalStake

          await supabase.from('battles').update(updates).eq('id', selection.matchId)
        }
      }

      setSlipSelections([])
      window.dispatchEvent(new Event('balance-refresh'))
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: '🎯 Ticket placed!', type: 'success' } }))
    } catch (err: any) {
      console.error('Failed to place ticket:', err)
      alert('Failed: ' + (err.message || err))
    }
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <PredaStyles />
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(circle at top right, rgba(141,255,79,0.07), transparent 24%), radial-gradient(circle at top left, rgba(141,255,79,0.05), transparent 18%)" }} />

      <Toast />
      <LoadingOverlay loading={loading} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <BreakingNewsPopup />

      <DesktopHeader expanded={sidebarExpanded} onToggleSidebar={() => setSidebarExpanded(!sidebarExpanded)} onOpenAuth={() => setAuthOpen(true)} onLogoClick={() => navigate("/")} />

      <DesktopSidebar
        expanded={sidebarExpanded}
        openSection={openSection}
        setOpenSection={setOpenSection}
        onNavigate={(path) => navigate(path)}
        currentPath={location.pathname}
      />

      <MobileShell
        open={mobileSidebarOpen}
        setOpen={setMobileSidebarOpen}
        onOpenAuth={() => setAuthOpen(true)}
        onNavigate={(path) => navigate(path)}
        openSection={openSection}
        setOpenSection={setOpenSection}
        currentPath={location.pathname}
      />

      <SlipHandle open={slipOpen} setOpen={setSlipOpen} count={slipSelections.length} />
      <SlipDrawer open={slipOpen} items={slipSelections} stake={stake} setStake={setStake} onRemove={handleRemoveSelection} onPlaceTicket={handlePlaceTicket} onClose={() => setSlipOpen(false)} />

      <div className={cx("transition-all duration-300", sidebarExpanded ? "lg:pl-[280px]" : "lg:pl-[86px]", "pt-[68px] pb-[72px] lg:pt-[72px] lg:pb-0")}>
        <Showboard onNavigate={(path) => navigate(path)} />

        <main className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 xl:px-8">
          {renderPageContent()}
         <Footer onNavigate={(path) => navigate(path)} />
        </main>
      </div>

      <BottomNav onNavigate={(path) => navigate(path)} onOpenSlip={() => setSlipOpen(true)} />
    </div>
  );
}