import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useBattles } from "./hooks/useBattles";
import PriceChartModal from "./components/PriceChartModal";
import BetShareModal from "./components/BetShareModal";
import { useArcArena } from "./arc/useArcArena";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getAddress } from "viem";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate, useInView } from "framer-motion";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDollarSign,
  LayoutGrid,
  Menu,
  Wallet,
  X,
  Swords,
  Target,
  ClipboardList,
  BarChart3,
  Sun,
  Moon,
  Ticket,
  AlertTriangle,
  Trophy,
  XCircle,
  Clock,
  Copy,
  Check,
  MinusCircle,
  Loader2,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "./useTheme";
import { useSession } from "./useSession";
import ShareStatsModal from "./ShareStatsModal";
import Avatar from "./Avatar";

type Side = "left" | "draw" | "right";
type MatchBoard = "Live" | "Upcoming";
type MatchCategory = "Major" | "Altcoins" | "L1" | "L2" | "DeFi" | "Meme" | "AI";
type MatchDuration = "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W" | "1M" | "1Y";

type Match = {
  id: string;
  // Null until the keeper mirrors this battle onto Arc. The slip uses it to
  // decide whether the Arc tab is even offerable.
  arcBattleId?: number | null;
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
  endTime?: string;
  startPriceA?: number;
  startPriceB?: number;
  bettingLocked?: boolean;
  progress?: number;
};

type SlipSelection = {
  matchId: string;
  arcBattleId?: number | null;
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
  bg: "var(--bg)",
  panel: "var(--panel)",
  line: "var(--border-soft)",
  lineStrong: "var(--border)",
  accent: "var(--accent)",
  accentSoft: "var(--accent-soft)",
  accentGlow: "var(--accent-soft)",
  textSoft: "var(--text-soft)",
  accent2: "var(--accent)",
  gradient: "linear-gradient(120deg, var(--accent), var(--accent-2))",
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
    title: "ACCOUNT",
    items: [
      { label: "Settings", path: "/settings" },
    ],
  },
  {
    title: "MY BETS",
    items: [
      { label: "Running Bets", path: "/running" },
      { label: "History", path: "/history" },
      { label: "My Stats", path: "/profile" },
    ],
  },
  {
    title: "NEWS",
    items: [
      { label: "Crypto News", path: "/news" },
    ],
  },
  {
    title: "PRODUCT",
    items: [
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
    title: "LIVE ON SOLANA",
    text: "Built by humans and AI on the Solana blockchain for the best user experience.",
    cta: "Start Betting",
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
        className="flex h-6 w-6 items-center justify-center rounded-full border bg-[var(--panel)]/5 text-[10px] font-semibold text-white"
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
        <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg)]">
          <div className="flex flex-col items-center">
            <motion.div
              animate={{ scale: [1, 1.06, 1], opacity: [1, 0.85, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-16 w-16 items-center justify-center rounded-[18px] text-xl font-bold text-white"
              style={{ background: "var(--brand-grad)", boxShadow: "0 8px 28px rgba(124,58,237,0.24)" }}
            >
              P
            </motion.div>
            <div className="mt-5 h-1 w-32 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
                animate={{ x: ["-100%", "250%"] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <p className="mt-4 text-sm" style={{ color: "var(--text-soft)" }}>
              Loading arena…
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
            className="w-full max-w-md overflow-hidden rounded-[24px] bg-[var(--panel)] shadow-[0_24px_70px_rgba(20,20,30,0.28)]"
            style={{ borderColor: COLORS.lineStrong }}
          >
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: COLORS.line }}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: COLORS.accent }}>
                  PREDA Access
                </p>
                <h3 className="mt-1 text-xl font-semibold" style={{ color: "var(--text)" }}>Wallet + Social Login</h3>
              </div>
              <button onClick={onClose} className="rounded-full p-2 transition-all hover:bg-[var(--border-soft)] active:scale-95" style={{ background: "var(--bg)", color: "var(--text-2)" }}>
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
    <button className="flex w-full items-center justify-between rounded-2xl border bg-[var(--panel)]/5 px-4 py-3 text-left transition hover:bg-[var(--panel)]/[0.07]" style={{ borderColor: COLORS.line }}>
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
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState<{ title: string; source: string; url: string } | null>(null);
  const [newsIndex, setNewsIndex] = useState(0);
  const [allNews, setAllNews] = useState<any[]>([]);

  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch('/api/content?type=news')
        const data = await res.json()
        if (data?.Data?.length) {
          setAllNews(data.Data)
          const first = data.Data[0]
          setNews({ title: first.title, source: first.source || first.source_info?.name || 'Crypto News', url: first.url })
          setOpen(true)
        }
      } catch {
        // fallback
        setNews({ title: 'BTC, ETH and SOL markets showing increased volatility. Monitor positions closely.', source: 'Market Alert', url: '#' })
        setOpen(true)
      }
    }
    const t = setTimeout(fetchNews, 2000)
    return () => clearTimeout(t)
  }, []);

  useEffect(() => {
    if (!open || allNews.length === 0) return
    const timer = setTimeout(() => {
      const next = (newsIndex + 1) % allNews.length
      const item = allNews[next]
      setNews({ title: item.title, source: item.source || item.source_info?.name || 'Crypto News', url: item.url })
      setNewsIndex(next)
    }, 9000)
    return () => clearTimeout(timer)
  }, [open, newsIndex, allNews]);

  if (!news) return null

  return (
    <AnimatePresence>
      {open ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-24 right-5 z-[38] w-full max-w-sm rounded-[20px] p-4 bg-[var(--panel)] lg:bottom-5 lg:right-[404px]" style={{ boxShadow: "0 12px 40px rgba(20,20,30,0.16)", border: "1px solid var(--border-soft)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>
                  {news.source}
                </p>
                <a href={news.url} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); if(news.url !== '#') window.open(news.url, '_blank') }} className="mt-1 text-sm font-medium hover:underline line-clamp-2 block cursor-pointer" style={{ color: "var(--text)" }}>
                  {news.title}
                </a>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full border p-2 text-slate-400 shrink-0" style={{ borderColor: COLORS.line }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Single source of truth for entering a booking code. Normalizes and routes
// to /bet/CODE, which BetSharePage resolves and hands to the homepage slip
// restore. Shared by the desktop header input and the mobile bottom sheet.
function resolveBetCode(code: string, navigate: (to: string) => void): boolean {
  const c = code.trim().toUpperCase();
  if (!c) return false;
  navigate(`/bet/${c}`);
  return true;
}

// Mobile bottom sheet for booking-code entry. Mirrors the SlipDrawer sheet
// language (slide up, rounded-t, panel bg); backdrop tap dismisses.
function BetCodeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [code, setCode] = React.useState('');
  const go = () => { if (resolveBetCode(code, navigate)) { setCode(''); onClose(); } };
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[46] bg-black/50 backdrop-blur-[2px] lg:hidden" onClick={onClose} />
      )}
      <motion.div
        initial={false}
        animate={open
          ? { y: 0, opacity: 1, pointerEvents: "auto" }
          : { y: "110%", opacity: 0, pointerEvents: "none" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-[47] flex w-full flex-col rounded-t-[28px] bg-[var(--panel)] px-5 pb-8 pt-5 shadow-[0_-8px_40px_rgba(20,20,30,0.16)] lg:hidden"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: "var(--border)" }} />
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white" style={{ background: "var(--brand-grad)" }}>
              <Ticket className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Enter booking code</p>
              <p className="text-xs" style={{ color: "var(--text-soft)" }}>Load a shared bet slip</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2" style={{ background: "var(--panel-2)" }}>
            <X className="h-4 w-4" style={{ color: "var(--text-soft)" }} />
          </button>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
          placeholder="PREDA-XXXXX"
          autoFocus
          className="h-12 w-full rounded-[12px] px-4 text-base font-mono tracking-widest outline-none"
          style={{ background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
        <button
          onClick={go}
          disabled={!code.trim()}
          className="mt-3 h-12 w-full rounded-[12px] text-sm font-semibold text-white transition-all active:scale-[0.99] disabled:opacity-40"
          style={{ background: "var(--brand-grad)" }}
        >
          Load bet
        </button>
      </motion.div>
    </>
  );
}

// Desktop inline entry (header).
function BookingCodeInput() {
  const navigate = useNavigate();
  const [code, setCode] = React.useState('');
  const go = () => { if (resolveBetCode(code, navigate)) setCode(''); };
  return (
    <div className="flex items-center gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
        placeholder="Enter booking code"
        className="h-9 w-[180px] rounded-[10px] px-3 text-sm outline-none"
        style={{ background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)" }}
      />
      <button
        onClick={go}
        disabled={!code.trim()}
        className="h-9 px-4 rounded-[10px] text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: "var(--brand-grad)" }}
      >
        Go
      </button>
    </div>
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
    <header className="fixed inset-x-0 top-0 z-50 hidden h-[72px] border-b bg-[var(--panel)]/95 backdrop-blur-xl lg:block" style={{ borderColor: "var(--border)" }}>
      <div className="flex h-full items-center justify-between">
        <button onClick={onToggleSidebar} className={cx("flex h-full items-center gap-3 border-r px-4 text-left transition-all duration-300", expanded ? "w-[280px]" : "w-[86px]")} style={{ borderColor: "var(--border)" }}>
          <motion.div
            whileHover={{ rotate: -6, scale: 1.04 }}
            onClick={(e) => {
              e.stopPropagation();
              onLogoClick();
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-sm font-bold text-white"
            style={{ background: "var(--brand-grad)" }}
          >
            P
          </motion.div>
          {expanded && <span className="text-lg font-display" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>PREDA</span>}
        </button>

        <div className="flex items-center flex-1 px-5 gap-3">
          <BookingCodeInput />
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
            className="group mb-2 w-full text-left"
          >
            {expanded ? (
              <div className="flex items-center justify-between px-2 py-1 rounded-lg transition-colors group-hover:bg-[var(--panel-2)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] transition-colors" style={{ color: openSection === section.title ? "var(--text)" : "var(--text-soft)" }}>
                  {section.title}
                </p>
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" style={{ color: "var(--text-muted)", transform: openSection === section.title ? "rotate(180deg)" : "rotate(0deg)" }} />
              </div>
            ) : (
              <p className="text-center text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>
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
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--panel-2)]"
                        style={{
                          background: active ? "var(--accent-soft)" : "transparent",
                        }}
                      >
                        <span className={cx("text-sm font-semibold", active ? "" : "")} style={{ color: active ? "var(--text)" : "var(--text-2)" }}>
                          {expanded ? item.label : item.label.slice(0, 1)}
                        </span>
                        {expanded && item.soon ? (
                          <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "var(--border-soft)", color: "var(--text-soft)" }}>
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
            background: toast.type === 'success' ? COLORS.accent : 'var(--neg)',
            color: toast.type === 'success' ? '#000' : '#fff'
          }}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}

/**
 * TEMPORARY test harness for wallet session auth.
 *
 * It answers exactly one question: does the server's verifyMessage() accept a
 * real MetaMask signature over the message we construct? Everything downstream -
 * locking RLS on tickets and user_balances, and profiles (b) proving address
 * ownership - is worthless if the answer is no, and the failure would look like
 * "users cannot see their money".
 *
 * The endpoint's validation paths are already proven by curl. This proves the
 * one part curl cannot: a genuine signature. Delete once the real sign-in flow
 * replaces it.
 */
/**
 * SettingsWallets - sign in once, see linked wallets, add more.
 *
 * Stops the split-brain: "Add wallet" links the connected wallet into the
 * EXISTING profile via linkWallet(), instead of a bare sign-in forking a second
 * profile. linkWallet already signs Solana (adapter) or EVM (personal_sign), so
 * to add a Solana wallet, connect it first, then tap Add.
 */
function SettingsWallets() {
  const { signedIn, addresses, username, signIn, signOut, linkWallet, setUsernameFor, unlinkedWallet } = useSession();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [nameInput, setNameInput] = React.useState("");
  const [nameMsg, setNameMsg] = React.useState<string | null>(null);

  async function handleSetName() {
    setNameMsg(null);
    const r = await setUsernameFor(nameInput);
    if (r.ok) { setNameMsg("Username set."); setNameInput(""); }
    else if (r.error === "username_taken") setNameMsg("That username is taken.");
    else if (r.error === "invalid_username") setNameMsg("3-20 characters: letters, numbers, underscore.");
    else setNameMsg(`Couldn't set: ${r.error || "error"}`);
  }

  async function handleSignIn() {
    setBusy(true); setMsg(null);
    try {
      const ok = await signIn();
      if (!ok) setMsg("Sign-in was cancelled or failed.");
    } finally { setBusy(false); }
  }

  async function handleAdd() {
    setBusy(true); setMsg(null);
    try {
      const r = await linkWallet();
      if (r.ok) setMsg("Wallet linked.");
      else if (r.error === "address_belongs_to_another_profile")
        setMsg("That wallet is already linked to a different account.");
      else if (r.error === "no_wallet")
        setMsg("Connect the wallet you want to add first, then tap Add wallet.");
      else setMsg(`Couldn't link: ${r.error || "unknown error"}`);
    } finally { setBusy(false); }
  }

  const short = (a: string) => a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
  const chainOf = (a: string) => a.startsWith("0x") ? "EVM (Ethereum / Arc)" : "Solana";

  if (!signedIn) return (
    <div className="rounded-[18px] p-6 mb-6" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Your account</h3>
      <p className="mt-1 text-sm" style={{ color: "var(--text-soft)" }}>
        Sign in with your wallet to see all your bets in one place. A quick signature - no transaction, no fee.
      </p>
      <button
        onClick={handleSignIn}
        disabled={busy}
        className="mt-4 rounded-[12px] px-5 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: "var(--brand-grad)" }}
      >
        {busy ? "Check your wallet..." : "Sign in with wallet"}
      </button>
      {msg && <p className="mt-3 text-[13px]" style={{ color: "var(--neg)" }}>{msg}</p>}
    </div>
  );

  return (
    <div className="rounded-[18px] p-6 mb-6" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar seed={username} size={44} />
          <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            {username ? username : "Your account"}
          </h3>
        </div>
        <button onClick={signOut} className="text-xs font-medium" style={{ color: "var(--text-soft)" }}>
          Sign out
        </button>
      </div>

      {!username && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Choose a username"
            className="flex-1 min-w-[160px] rounded-[10px] px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            onClick={handleSetName}
            disabled={nameInput.trim().length < 3}
            className="rounded-[10px] px-4 py-2 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", color: "var(--accent)" }}
          >
            Save
          </button>
        </div>
      )}
      {nameMsg && <p className="mt-2 text-[13px]" style={{ color: nameMsg === "Username set." ? "var(--pos)" : "var(--neg)" }}>{nameMsg}</p>}

      <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>
        {addresses.length} wallet{addresses.length === 1 ? "" : "s"} linked. Bets from all of them show together.
      </p>

      <div className="mt-4 space-y-2">
        {addresses.map((a, i) => (
          <div key={a} className="flex items-center justify-between rounded-[12px] px-4 py-3"
               style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{short(a)}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{chainOf(a)}</p>
            </div>
            {i === 0 && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] rounded-full px-2.5 py-1"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                Primary
              </span>
            )}
          </div>
        ))}
      </div>

      {unlinkedWallet && addresses.length > 0 && (
        <div className="mt-4 rounded-[12px] p-3" style={{ background: "var(--warn-soft, var(--panel-2))", border: "1px solid var(--warn, var(--accent))" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
            You've connected {short(unlinkedWallet)} - it's not linked to your account yet.
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-soft)" }}>
            Link it to see this wallet's bets in your profile.
          </p>
          <button
            onClick={handleAdd}
            disabled={busy}
            className="mt-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-ink, #fff)" }}
          >
            {busy ? "Check your wallet..." : `Link ${short(unlinkedWallet)}`}
          </button>
        </div>
      )}

      <div className="mt-4 rounded-[12px] p-3" style={{ background: "var(--panel-2)", border: "1px dashed var(--border)" }}>
        <p className="text-[13px]" style={{ color: "var(--text-soft)" }}>
          Bet from another wallet? Connect it with the wallet button, then:
        </p>
        <button
          onClick={handleAdd}
          disabled={busy}
          className="mt-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", color: "var(--accent)" }}
        >
          {busy ? "Check your wallet..." : "Add connected wallet"}
        </button>
      </div>

      {msg && (
        <p className="mt-3 text-[13px]" style={{ color: msg === "Wallet linked." ? "var(--pos)" : "var(--neg)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

function SessionTestButton() {
  const [status, setStatus] = React.useState<string>('')
  const [busy, setBusy] = React.useState(false)
  const [token, setToken] = React.useState<string>('')

  async function run() {
    setBusy(true)
    setStatus('')
    try {
      const eth = (window as any).ethereum
      if (!eth) { setStatus('No EVM wallet found'); return }

      const [addr] = await eth.request({ method: 'eth_requestAccounts' })

      const nRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'nonce', address: addr, chain: 'evm' }),
      })
      const n = await nRes.json()
      if (!nRes.ok) { setStatus(`nonce failed: ${n.error}`); return }

      const sig = await eth.request({ method: 'personal_sign', params: [n.message, addr] })

      const vRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', nonce: n.nonce, signature: sig }),
      })
      const v = await vRes.json()
      if (!vRes.ok) { setStatus(`verify failed: ${v.error}`); return }
      setToken(v.token)

      // The nonce must be single-use, or a captured signature is replayable and
      // the whole mechanism is decorative.
      const rRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', nonce: n.nonce, signature: sig }),
      })
      const r = await rRes.json()
      const replayBlocked = r.error === 'nonce_invalid_or_used'

      // The 401s prove it refuses. This proves it ACCEPTS - and returns the
      // right rows for every address on the profile, which is the thing the
      // whole client will depend on.
      const [meRes, tRes, bRes] = await Promise.all([
        fetch('/api/my-data?type=me',      { headers: { Authorization: `Bearer ${v.token}` } }),
        fetch('/api/my-data?type=tickets', { headers: { Authorization: `Bearer ${v.token}` } }),
        fetch('/api/my-data?type=balance', { headers: { Authorization: `Bearer ${v.token}` } }),
      ])
      const me = await meRes.json()
      const t  = await tRes.json()
      const b  = await bRes.json()

      setStatus(
        `OK — ${v.address.slice(0, 6)}…${v.address.slice(-4)} · replay ${replayBlocked ? 'blocked' : 'NOT BLOCKED'} · ` +
        `addresses ${me.addresses?.length ?? '?'} · tickets ${t.tickets?.length ?? t.error} · ` +
        `balance ${b.total_lamports != null ? (b.total_lamports / 1e9).toFixed(3) + ' SOL' : b.error}`
      )
    } catch (e: any) {
      setStatus(e?.message?.slice(0, 80) || 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={busy}
        className="flex w-full items-center justify-center rounded-[12px] px-3 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", color: "var(--accent)" }}
      >
        {busy ? 'Check your wallet…' : 'Test wallet sign-in'}
      </button>
      {status && (
        <p className="mt-2 text-[11px] leading-tight" style={{ color: status.startsWith('OK') ? 'var(--pos)' : 'var(--neg)' }}>
          {status}
        </p>
      )}
      {token && (
        <button
          onClick={linkWallet}
          disabled={busy}
          className="mt-2 flex w-full items-center justify-center rounded-[12px] px-3 py-2.5 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--chain-arc-soft)", border: "1px solid var(--chain-arc)", color: "var(--chain-arc)" }}
        >
          {busy ? 'Check your wallet…' : 'Link the wallet now active in MetaMask'}
        </button>
      )}
    </div>
  )

  async function linkWallet() {
    setBusy(true)
    try {
      const eth = (window as any).ethereum
      // Whatever wallet is CURRENTLY selected in MetaMask - switch it first.
      const [addr] = await eth.request({ method: 'eth_requestAccounts' })

      const nRes = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'nonce', address: addr, chain: 'evm' }),
      })
      const n = await nRes.json()
      if (!nRes.ok) { setStatus(`nonce failed: ${n.error}`); return }

      const sig = await eth.request({ method: 'personal_sign', params: [n.message, addr] })

      const lRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'link', nonce: n.nonce, signature: sig }),
      })
      const l = await lRes.json()
      if (!lRes.ok) { setStatus(`link failed: ${l.error}`); return }

      // Re-read with the SAME token - addresses and tickets should both jump.
      const t = await (await fetch('/api/my-data?type=tickets', { headers: { Authorization: `Bearer ${token}` } })).json()
      const me = await (await fetch('/api/my-data?type=me', { headers: { Authorization: `Bearer ${token}` } })).json()
      setStatus(`LINKED ${addr.slice(0,6)}…${addr.slice(-4)} · now ${me.addresses?.length} addresses · ${t.tickets?.length} tickets`)
    } catch (e: any) {
      setStatus(e?.message?.slice(0, 80) || 'link failed')
    } finally {
      setBusy(false)
    }
  }
}

function MobileThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="mt-3 flex w-full items-center justify-between rounded-[12px] px-3 py-2.5 text-sm font-medium transition-all active:scale-[0.98]"
      style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
    >
      <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
      {theme === "dark"
        ? <Sun className="h-4 w-4" style={{ color: "var(--text-soft)" }} />
        : <Moon className="h-4 w-4" style={{ color: "var(--text-soft)" }} />}
    </button>
  );
}

function UserBalancePanel() {
  const { publicKey, connected, sendTransaction, signMessage } = useWallet()
  const [balance, setBalance] = React.useState<number>(0)
  const [solPrice, setSolPrice] = React.useState<number | null>(null)
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
      const p = parsed ? Number(parsed.price.price) * Math.pow(10, parsed.price.expo) : NaN
      // Only accept a real number. On failure solPrice stays null and the UI
      // shows SOL instead of inventing a USD figure.
      if (p > 0) setSolPrice(p)
      else console.error('SOL price unavailable — showing SOL, not USD')
    } catch (err) {
      console.error('Failed to fetch SOL price:', err)
    }
  }

  async function handleDeposit() {
    if (!connected || !publicKey || !depositAmount) return
    setLoading(true)
    try {
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
      
      // Custodial vault: one hot wallet holds user SOL. Deposits and
      // withdrawals use this same address. Set via env at build time.
      const vaultAddress = new PublicKey(
        process.env.REACT_APP_PLATFORM_VAULT_ADDRESS ||
        '5GD6YvnQeTLC1W1xYCD6jPzvg5vcn4wC5JZvKV4nsD3V'
      )

      const lamports = Math.floor(Number(depositAmount) * 1_000_000_000)
      
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: vaultAddress,
          lamports,
        })
      )

      const sig = await sendTransaction(tx, connection)

      // Confirm quickly, then let the server wait for finality. Blocking the
      // UI on 'finalized' hit the adapter's 30s timeout on devnet, leaving the
      // SOL in the vault with nothing credited.
      await connection.confirmTransaction(sig, 'confirmed')

      // The server verifies the transaction on-chain (finalized, landed in the
      // vault, signed by this wallet) and reads the lamports from the chain.
      // The client no longer touches user_balances at all.
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deposit', signature: sig, wallet_address: walletAddr }),
      })

      const result = await res.json()

      if (res.status === 202) {
        // The transfer landed on-chain but hasn't finalized yet. The signature
        // is the receipt — crediting is idempotent, so retrying is safe.
        setDepositAmount('')
        setShowDeposit(false)
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Deposit sent — confirming on-chain. Your balance will update shortly.', type: 'success' }
        }))
        return
      }

      if (!res.ok) {
        const messages: Record<string, string> = {
          deposit_pending: 'Still confirming — your balance will update shortly',
          tx_not_found_or_not_finalized: 'Transaction not finalized yet — try again in a moment',
          tx_failed: 'The deposit transaction failed on-chain',
          not_a_vault_deposit: 'That transaction was not a deposit to the vault',
          no_vault_credit: 'No funds reached the vault',
          signer_mismatch: 'That transaction was not signed by your wallet',
          deposit_already_credited: 'This deposit has already been credited',
        }
        throw new Error(messages[result.error] || result.error || 'Deposit could not be credited')
      }

      setBalance(prev => prev + (result.lamports || lamports))
      setDepositAmount('')
      setShowDeposit(false)
      window.dispatchEvent(new Event('balance-refresh'))
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Deposit successful', type: 'success' } }))
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Deposit failed: ' + err.message, type: 'error' } }))
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

      // The server requires proof the caller owns this wallet. Ask the
      // wallet to sign a message naming the amount + destination, then send
      // it along. base64 via btoa (no Buffer in the browser bundle).
      if (!signMessage) {
        throw new Error('Your wallet does not support message signing')
      }
      const message = `PredArena withdraw ${lamports} to ${walletAddr} at ${Date.now()}`
      const sigBytes = await signMessage(new TextEncoder().encode(message))
      let binary = ''
      for (let i = 0; i < sigBytes.length; i++) binary += String.fromCharCode(sigBytes[i])
      const signature = btoa(binary)

      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw',
          wallet_address: walletAddr,
          amount_lamports: lamports,
          signature,
          message,
        })
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }

      setBalance(prev => prev - lamports)
      setWithdrawAmount('')
      setShowWithdraw(false)
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Withdrawal successful', type: 'success' } }))
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Withdrawal failed: ' + err.message, type: 'error' } }))
    } finally {
      setLoading(false)
    }
  }

  const balanceSol = balance / 1_000_000_000
  const balanceUsd = solPrice != null ? balanceSol * solPrice : null

  if (!connected) {
    return (
      <div className="rounded-2xl border p-3" style={{ borderColor: COLORS.line }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>User Profile</p>
        <p className="mt-1 text-xs" style={{ color: COLORS.textSoft }}>Connect wallet to see balance</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border p-3 space-y-3" style={{ borderColor: COLORS.line }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>User Profile</p>
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
          {currency === 'USD' && balanceUsd != null ? `$${balanceUsd.toFixed(2)}` : `${balanceSol.toFixed(4)} SOL`}
        </p>
        <p className="text-xs" style={{ color: COLORS.textSoft }}>
          {currency === 'USD' ? `${balanceSol.toFixed(4)} SOL` : balanceUsd != null ? `$${balanceUsd.toFixed(2)}` : 'USD price unavailable'}
        </p>
      </div>

      {showDeposit && (
        <div className="space-y-2">
          <input
            type="number"
            placeholder="Amount in SOL"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            className="w-full rounded-[10px] px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            onClick={handleDeposit}
            disabled={loading}
            className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: "var(--brand-grad)" }}
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
            className="w-full rounded-[10px] px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            onClick={handleWithdraw}
            disabled={loading}
            className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: "var(--brand-grad)" }}
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
    <aside className={cx("fixed bottom-0 left-0 top-[72px] z-40 hidden border-r bg-[var(--panel)] transition-all duration-300 lg:block", expanded ? "w-[280px]" : "w-[86px]")} style={{ borderColor: "var(--border)" }}>
      <div className="preda-scrollbar-hide flex h-full flex-col justify-between overflow-y-auto px-3 py-4">
        <div>
          <SidebarAccordion expanded={expanded} openSection={openSection} setOpenSection={setOpenSection} currentPath={currentPath} onNavigate={onNavigate} />
        </div>

        <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
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
  onOpenBetCode,
  onNavigate,
  openSection,
  setOpenSection,
  currentPath,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onOpenAuth: () => void;
  onOpenBetCode: () => void;
  onNavigate: (path: string) => void;
  openSection: string | null;
  setOpenSection: (value: string | null) => void;
  currentPath: string;
}) {
  return (
    <>
      <div className="sticky top-0 z-50 flex h-[68px] items-center justify-between border-b bg-[var(--panel)]/95 px-4 backdrop-blur-xl lg:hidden" style={{ borderColor: "var(--border)" }}>
        <button onClick={() => setOpen(true)} className="rounded-xl border p-2" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] text-sm font-bold text-white" style={{ background: "var(--brand-grad)" }}>
            P
          </div>
          <span className="text-base font-display" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>PREDA</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenBetCode} aria-label="Enter booking code" className="rounded-xl border p-2" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <Ticket className="h-5 w-5" />
          </button>
          <button onClick={onOpenAuth} className="rounded-xl px-3 py-2 text-xs font-bold text-[var(--panel)]" style={{ background: "var(--text)" }}>
            Connect
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/70 lg:hidden">
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} className="h-full w-[300px] border-r bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[14px] text-sm font-bold text-white" style={{ background: "var(--brand-grad)" }}>
                    P
                  </div>
                  <span className="text-base font-display" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>PREDA</span>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-xl border p-2" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="preda-scrollbar-hide h-[calc(100%-73px)] overflow-y-auto px-3 py-4">
                {/* Balance + deposit lived ONLY in the desktop sidebar, which is
                    lg:block - so on a phone this component never mounted and
                    there was no way to see your balance or deposit at all. The
                    68px top bar is already full (menu, logo, ticket, connect),
                    so it goes here, above the nav, where it is the first thing
                    in the drawer. */}
                <div className="mb-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
                  <UserBalancePanel />
                  {/* The toggle lived only in the desktop header (lg:-gated), so
                      phones had no way to change theme at all. Same context as
                      the desktop one - one state, two mount points. */}
                  <MobileThemeToggle />
                  <SessionTestButton />
                </div>
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
      <div className="relative overflow-hidden rounded-[28px] px-6 py-9 sm:px-10 sm:py-11" style={{ background: "var(--hero-grad)", boxShadow: "0 28px 70px -24px rgba(20,83,45,0.7), inset 0 1px 0 rgba(255,255,255,0.09)" }}>
        <div className="absolute inset-y-0 left-0 w-40 bg-[radial-gradient(circle_at_left,rgba(255,255,255,0.14),transparent_65%)]" />
        <div className="absolute inset-y-0 right-0 w-40 bg-[radial-gradient(circle_at_right,rgba(255,255,255,0.10),transparent_65%)]" />

        <div className="relative flex items-center justify-between gap-6">
          <button onClick={() => setCurrent((prev) => (prev - 1 + showSlides.length) % showSlides.length)} className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/25 text-white/80 hover:bg-[var(--panel)]/10 sm:flex">
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div key={slide.title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.28 }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-pink-100">
                  {slide.title}
                </p>
                <p className="font-display mt-3 max-w-4xl text-xl text-white sm:text-[28px] leading-[1.14]">{slide.text}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button onClick={() => onNavigate("/")} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--panel)] px-5 py-3 text-sm font-bold text-[var(--text)] hover:bg-pink-50">
                    {slide.cta}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <span className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white/85">
                    Built by humans and AI
                  </span>
                  <span className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white/85">
                    Live on Solana
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <button onClick={() => setCurrent((prev) => (prev + 1) % showSlides.length)} className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/25 text-white/80 hover:bg-[var(--panel)]/10 sm:flex">
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
    <div className="space-y-4 border-b px-5 py-5 sm:px-6" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {boardTabs.map((tab) => (
            <button key={tab} onClick={() => setSelectedBoard(tab)} className="inline-flex items-center justify-center h-9 px-4 rounded-[8px] text-sm font-medium transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] active:scale-[0.98]" style={selectedBoard === tab ? { background: "var(--text)", color: "var(--panel)" } : { border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-2)" }}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button key="All" onClick={() => setSelectedClass("All")} className="inline-flex items-center justify-center h-9 px-3.5 rounded-[8px] text-sm font-medium transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] active:scale-[0.98]" style={selectedClass === "All" ? { background: "var(--text)", color: "var(--panel)" } : { border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-2)" }}>
            All
          </button>

          {classTabs.map((tab) => (
            <button key={tab} onClick={() => setSelectedClass(tab)} className="inline-flex items-center justify-center h-9 px-3.5 rounded-[8px] text-sm font-medium transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] active:scale-[0.98]" style={selectedClass === tab ? { background: "var(--text)", color: "var(--panel)" } : { border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-2)" }}>
              {tab}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</p>
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

// Animated counting number — counts up to `value` on mount, respects tabular figures
function CountUp({ value, decimals = 2, className, style }: { value: number; decimals?: number; className?: string; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => v.toFixed(decimals))
  const [display, setDisplay] = React.useState("0." + "0".repeat(decimals))
  React.useEffect(() => {
    if (!inView) return
    const controls = animate(mv, value, { duration: 0.5, ease: [0.22, 1, 0.36, 1] })
    const unsub = rounded.on("change", (v) => setDisplay(v))
    return () => { controls.stop(); unsub() }
  }, [inView, value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={className} style={style}>{display}</span>
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
  const navigate = useNavigate()
  const isSettling = match.endTime ? Date.now() > new Date(match.endTime).getTime() : false
  const locked = match.bettingLocked || isSettling  // 80% cutoff OR past end

  const LEAGUE_COLORS: Record<string, string> = {
    // These used to be four arbitrary purples and three accents - a colour
    // that told you nothing, since three categories shared one value and the
    // label already reads "DeFi" in text. Either it is a real categorical scale
    // (7 distinguishable hues, which fights a 2-colour brand) or it is not
    // information. It is not. The text carries the meaning.
    Major: "var(--accent)", Altcoins: "var(--accent)", L1: "var(--accent)", L2: "var(--accent)",
    DeFi: "var(--accent)", Meme: "var(--accent)", AI: "var(--accent)",
  }
  const leagueColor = LEAGUE_COLORS[match.league] || "var(--accent)"

  const elapsedPct = (match.startTime && match.endTime)
    ? Math.min(100, Math.max(0, ((Date.now() - new Date(match.startTime).getTime()) / (new Date(match.endTime).getTime() - new Date(match.startTime).getTime())) * 100))
    : null

  const invL = 1 / match.left.odds, invR = 1 / match.right.odds, invD = 1 / match.draw.odds
  const leadPct = Math.round((invL / (invL + invR + invD)) * 100)

  const isNeg = (v: any) => String(v).trim().startsWith("-")

  const Pick = ({ side, label, odds }: { side: Side; label: string; odds: number }) => {
    const sel = selectedSide === side
    return (
      <motion.button
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.12 }}
        onClick={(e) => { e.stopPropagation(); if(!locked) onPick(match, side); }}
        style={{ opacity: locked ? 0.4 : 1, cursor: locked ? "not-allowed" : "pointer",
          flex: 1, textAlign: "center", padding: "16px 8px", borderRadius: 18,
          background: sel ? `linear-gradient(150deg, ${leagueColor}22, ${leagueColor}0d)` : "var(--panel-2)",
          boxShadow: sel ? `inset 0 0 0 1.5px ${leagueColor}` : "none",
          border: "none", transition: "background 0.18s",
        }}
      >
        <div className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--text-soft)", marginBottom: 7 }}>{label}</div>
        <div className="nums text-[19px] font-bold" style={{ color: "var(--text)" }}>{odds.toFixed(2)}×</div>
      </motion.button>
    )
  }

  return (
    <>
    <PriceChartModal
      open={chartOpen}
      onClose={() => setChartOpen(false)}
      coinA={match.left.ticker}
      coinB={match.right.ticker}
      startTime={match.startTime || new Date().toISOString()}
      startPriceA={match.startPriceA || 0}
      startPriceB={match.startPriceB || 0}
    />
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[26px] p-6 cursor-pointer border"
      style={{ background: "var(--panel)", borderColor: "var(--border-soft)", boxShadow: "var(--shadow-card)" }}
      onClick={() => navigate(`/battle/${match.id}`)}
    >
      <div className="flex items-center justify-between mb-[22px]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-[6px] h-[6px] rounded-full" style={{ background: leagueColor }} />
          <span className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{match.league}</span>
        </div>
        <div className="flex items-center gap-[6px] text-[12px] font-medium" style={{ color: match.board === "Live" ? leagueColor : "var(--warn)" }}>
          {match.board === "Live" && (
            <motion.span
              className="inline-block w-[6px] h-[6px] rounded-full"
              style={{ background: leagueColor }}
              animate={{ boxShadow: [`0 0 0 0 ${leagueColor}66`, `0 0 0 6px ${leagueColor}00`, `0 0 0 0 ${leagueColor}00`] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          {match.board}
        </div>
      </div>

      <h3 className="text-[23px] font-semibold tracking-[-0.03em]" style={{ color: "var(--text)" }}>{match.title}</h3>
      <p className="mt-1.5 mb-6 text-[13px] font-normal" style={{ color: "var(--text-soft)" }}>{match.duration} · {match.subtitle}</p>

      <div className="flex items-baseline gap-[10px] mb-[18px]">
        <span className="nums text-[34px] font-bold" style={{ color: "var(--text)" }}>
          <CountUp value={match.left.odds} />
          <span className="nums text-[20px] font-medium" style={{ color: "var(--text-muted)" }}>×</span>
        </span>
        <span className="nums text-[13px] font-medium" style={{ color: "var(--text-soft)" }}>/ {match.draw.odds.toFixed(2)}× draw</span>
        <span className="ml-auto nums text-[12px] font-semibold" style={{ color: leagueColor }}>{leadPct}% lead</span>
      </div>

      {elapsedPct !== null && (
        <>
          <div className="h-[4px] rounded-full overflow-hidden mb-[10px]" style={{ background: "var(--border-soft)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${leagueColor}, var(--accent-2))` }}
              initial={{ width: 0 }}
              whileInView={{ width: `${elapsedPct}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            />
          </div>
          <div className="nums flex items-center justify-between text-[11px] font-medium mb-[26px]" style={{ color: "var(--text-soft)" }}>
            <span>{isSettling ? "Settling..." : match.timer}</span>
            <span>{Math.round(elapsedPct)}% elapsed</span>
          </div>
        </>
      )}

      <div className="flex justify-between py-5 mb-[22px]" style={{ borderTop: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Entries</span>
          <span className="text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{match.entries}</span>
        </div>
        {match.pool > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Pool</span>
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{`$${match.pool.toLocaleString()}`}</span>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>{match.left.ticker}</span>
          <span className="text-[15px] font-semibold" style={{ color: isNeg(match.left.change) ? "var(--neg)" : "var(--pos)", fontVariantNumeric: "tabular-nums" }}>{match.left.change}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>{match.right.ticker}</span>
          <span className="text-[15px] font-semibold" style={{ color: isNeg(match.right.change) ? "var(--neg)" : "var(--pos)", fontVariantNumeric: "tabular-nums" }}>{match.right.change}</span>
        </div>
      </div>

      {locked ? (
        <div className="flex items-center justify-center gap-2 rounded-[18px] py-4" style={{ background: "var(--panel-2)", border: "1px dashed var(--border)" }}>
          <span className="inline-block w-[6px] h-[6px] rounded-full" style={{ background: "var(--text-muted)" }} />
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-soft)" }}>
            {isSettling ? "Settling · Awaiting Result" : "Betting Closed"}
          </span>
        </div>
      ) : (
        <div className="flex gap-[10px]">
          <Pick side="left" label={match.left.ticker} odds={match.left.odds} />
          <Pick side="draw" label="Draw" odds={match.draw.odds} />
          <Pick side="right" label={match.right.ticker} odds={match.right.odds} />
        </div>
      )}
    </motion.div>
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border px-3 py-3" style={{ background: "var(--panel-2)", borderColor: COLORS.line }}>
      <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textSoft }}>
        {label}
      </p>
      <p className="mt-2 font-medium" style={{ color: "var(--text)" }}>{value}</p>
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
      className="fixed right-4 top-1/2 z-[36] hidden -translate-y-1/2 rounded-[14px] px-4 py-3 text-sm font-semibold lg:block transition-all active:scale-95"
      style={{ background: "var(--panel)", color: "var(--text)", boxShadow: "0 4px 16px rgba(20,20,30,0.12)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <span>Slip</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "var(--brand-grad)" }}>
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
  requoteReady,
  oddsFlash,
  slipChain,
  setSlipChain,
  arcConnected,
  placing,
}: {
  open: boolean;
  items: SlipSelection[];
  stake: string;
  setStake: (v: string) => void;
  onRemove: (matchId: string) => void;
  onPlaceTicket: () => void;
  onClose: () => void;
  requoteReady?: boolean;
  oddsFlash?: Record<string, 'up' | 'down'>;
  slipChain: 'solana' | 'arc';
  setSlipChain: (c: 'solana' | 'arc') => void;
  arcConnected: boolean;
  placing?: boolean;
}) {
  const totalOdds = useMemo(() => calculateTotalOdds(items), [items]);
  const projected = useMemo(() => calculatePotentialPayout(Number(stake || 0), totalOdds), [stake, totalOdds]);
  // arcBattleId is null until the keeper mirrors a battle. Every leg needs one,
  // or placeCombo has nothing to reference on-chain.
  const notOnArc = items.filter((i) => i.arcBattleId == null).length;
  const allOnArc = items.length > 0 && notOnArc === 0;

  return (
    <>
    {/* Backdrop — tap to close, mobile only */}
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[54] bg-black/20 backdrop-blur-[2px] lg:hidden"
        />
      )}
    </AnimatePresence>
    <motion.aside
      initial={false}
      animate={open
        ? { x: 0, y: 0, opacity: 1, pointerEvents: "auto" }
        : { x: 0, y: "110%", opacity: 0, pointerEvents: "none" }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="fixed bottom-0 right-0 left-0 top-auto z-[55] flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--panel)] shadow-[0_-8px_40px_rgba(20,20,30,0.16)] lg:bottom-20 lg:right-5 lg:left-auto lg:top-auto lg:max-h-[calc(100vh-120px)] lg:w-[380px] lg:rounded-[24px] lg:shadow-[0_20px_60px_rgba(20,20,30,0.18)]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white" style={{ background: "var(--brand-grad)" }}>
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>My Slip</p>
              <p className="text-xs" style={{ color: "var(--text-soft)" }}>{items.length} selections</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-[var(--border-soft)] active:scale-95" style={{ background: "var(--bg)" }}>
            <X className="h-4 w-4" style={{ color: "var(--text-2)" }} />
          </button>
        </div>

        <div className="shrink-0 grid grid-cols-3 text-sm">
          {["Single", "Combo", "System"].map((tab) => {
            const active = items.length <= 1 ? "Single" : "Combo";
            const disabled = tab === "System";
            return (
              <div key={tab} className="px-3 py-3 text-center text-[13px] font-medium transition-colors" style={{ borderBottom: active === tab ? "2px solid var(--accent)" : "2px solid transparent", color: disabled ? "var(--text-muted)" : active === tab ? "var(--accent)" : "var(--text-soft)" }}>
                {tab}
              </div>
            );
          })}
        </div>

        <div className="preda-scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {items.length ? (
            items.map((item) => (
              <div key={item.matchId} className="flex gap-3 border-b px-5 py-4" style={{ borderColor: "var(--panel-2)" }}>
                <button onClick={() => onRemove(item.matchId)} className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-all hover:bg-[var(--border-soft)] active:scale-95" style={{ background: "var(--bg)", color: "var(--text-soft)" }}>
                  <X className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px]" style={{ color: "var(--text)" }}>{item.pickLabel}</p>
                  <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-soft)" }}>
                    {item.matchTitle}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "var(--text-muted)" }}>
                    3-Way · {item.duration}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="text-[17px] font-semibold transition-colors duration-300"
                    style={{
                      color: oddsFlash?.[item.matchId] === 'up' ? 'var(--pos)'
                        : oddsFlash?.[item.matchId] === 'down' ? 'var(--neg)'
                        : "var(--accent)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatOdds(item.oddsAtPick)}
                  </p>
                  {oddsFlash?.[item.matchId] && (
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em]"
                       style={{ color: oddsFlash[item.matchId] === 'up' ? 'var(--pos)' : 'var(--neg)' }}>
                      {oddsFlash[item.matchId] === 'up' ? 'up' : 'down'}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold text-[15px]" style={{ color: "var(--text)" }}>Your slip is empty</p>
              <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-soft)" }}>
                Pick left, draw, or right and your selections stack here automatically.
              </p>
            </div>
          )}
        </div>

        {/* Controls live INSIDE the scroller. Only the button is pinned - see
            the note on the button below. */}
        <div className="border-t px-5 py-4" style={{ borderColor: "var(--border-soft)", background: "var(--panel-2)" }}>
            {/* Chain is a property of the SLIP, not of a leg. A combo settles in
                ONE contract, so half-Solana/half-Arc has no meaning on either
                chain. Arc is only offerable when EVERY leg has been mirrored -
                /api/arc-quote refuses to sign for an unmapped battle. */}
            <div className="mb-2 flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)' }}>
              <button
                onClick={() => setSlipChain('solana')}
                className="flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all"
                style={{
                  background: slipChain === 'solana' ? 'var(--accent-soft)' : 'transparent',
                  color: slipChain === 'solana' ? 'var(--accent)' : 'var(--text-soft)',
                  border: slipChain === 'solana' ? '1px solid var(--accent)' : '1px solid transparent',
                }}
              >
                Solana
              </button>
              <button
                onClick={() => allOnArc && setSlipChain('arc')}
                disabled={!allOnArc}
                className="flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all disabled:cursor-not-allowed"
                style={{
                  background: slipChain === 'arc' ? 'var(--chain-arc-soft)' : 'transparent',
                  color: !allOnArc ? 'var(--text-muted)' : slipChain === 'arc' ? 'var(--chain-arc)' : 'var(--text-soft)',
                  border: slipChain === 'arc' ? '1px solid var(--chain-arc-soft)' : '1px solid transparent',
                  opacity: allOnArc ? 1 : 0.45,
                }}
              >
                Arc
              </button>
            </div>
            {/* One line, not two - this footer is height-critical on mobile.
                Still says WHY: a dead button teaches nothing. */}
            {((!allOnArc && items.length > 0) || (slipChain === 'arc' && !arcConnected)) && (
              <p className="mb-2 text-[10px] leading-tight" style={{ color: slipChain === 'arc' && !arcConnected ? 'var(--neg)' : 'var(--text-muted)' }}>
                {slipChain === 'arc' && !arcConnected
                  ? 'Connect an EVM wallet to bet on Arc'
                  : notOnArc === items.length
                    ? 'Not on Arc yet — still being mirrored'
                    : `${notOnArc} of ${items.length} not on Arc yet`}
              </p>
            )}
            <div className="flex items-center gap-2 rounded-[12px] px-4 py-3" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
              <CircleDollarSign className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              <input value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} placeholder="Enter stake" />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {quickStakes.map((size) => (
                <button key={size} onClick={() => setStake(String(size))} className="rounded-[10px] px-3 py-2 text-sm font-medium transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] hover:bg-[var(--border-soft)] active:scale-[0.97]" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                  {size}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2 text-sm">
              {items.length > 1 && (
                <div className="rounded-xl px-3 py-2 mb-2" style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg-soft)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--neg)' }}>
                    <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" /> Combo Bet — If any leg loses, the entire bet loses
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between" style={{ color: "var(--text-soft)" }}>
                <span>{items.length > 1 ? 'Combined Odds' : 'Odds'}</span>
                <span className="font-semibold" style={{ color: "var(--text)" }}>{items.length ? formatOdds(totalOdds) : "--"}</span>
              </div>
              <div className="flex items-center justify-between" style={{ color: "var(--text-soft)" }}>
                <span>Stake</span>
                <span className="font-semibold" style={{ color: "var(--text)" }}>{stake ? `${stake}` : "--"}</span>
              </div>
              {items.length > 1 && (
                <div className="flex items-center justify-between" style={{ color: "var(--text-soft)" }}>
                  <span>Legs</span>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>{items.length} selections</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 mt-1 border-t" style={{ borderColor: "var(--border-soft)" }}>
                <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Potential Win</span>
                <span className="text-[18px] font-semibold" style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                  {items.length ? `${projected.toFixed(2)}` : "--"}
                </span>
              </div>
            </div>

          {/* Disabled while a bet is in flight. An Arc bet is a quote fetch plus
              TWO wallet confirmations, so the button sits idle-looking for many
              seconds - and a double-tap there means two real transactions. */}
          <button disabled={!items.length || placing} onClick={onPlaceTicket} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[12px] text-sm font-semibold text-white transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "var(--brand-grad)" }}>
            {placing && <Loader2 className="h-4 w-4 animate-spin" />}
            {placing
              ? (slipChain === 'arc' ? 'Confirm in your wallet…' : 'Placing…')
              : requoteReady
                ? 'Confirm at new odds'
                : items.length > 1
                  ? `Place Combo (${items.length} legs)`
                  : 'Place Ticket'}
          </button>
        </div>
      </div>
    </motion.aside>
    </>
  );
}

function BottomNav({
  onNavigate,
  onOpenSlip,
}: {
  onNavigate: (path: string) => void;
  onOpenSlip: () => void;
}) {
  const location = useLocation()
  const path = location.pathname

  // Five is the ceiling before labels start wrapping on a small phone. News
  // gives way to Stats: the other four are all "my money" or "place a bet",
  // News is content that also lives in the drawer nav.
  const items = [
    { label: 'Home', Icon: Swords, route: '/' },
    { label: 'Running', Icon: Target, route: '/running' },
    { label: 'Slip', Icon: ClipboardList, route: '__slip__' },
    { label: 'History', Icon: BarChart3, route: '/history' },
    { label: 'Stats', Icon: User, route: '/profile' },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t lg:hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-around px-1 py-1.5 pb-safe">
        {items.map(item => {
          const isActive = item.route === '__slip__' ? false : path === item.route
          const Ico = item.Icon
          return (
            <button
              key={item.label}
              onClick={() => item.route === '__slip__' ? onOpenSlip() : onNavigate(item.route)}
              className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-[12px] transition-all active:scale-95"
              style={{
                color: isActive ? 'var(--accent)' : 'var(--text-soft)',
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                minWidth: 56,
              }}
            >
              <Ico className="h-[18px] w-[18px]" strokeWidth={2.2} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          )
        })}
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
    <div className="rounded-[24px] bg-[var(--panel)] p-8" style={{ boxShadow: "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(20,20,30,0.05)" }}>
      <h2 className="font-display text-[30px]" style={{ color: "var(--text)" }}>{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--text-soft)" }}>
        {body}
      </p>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <h2 className="font-display text-[30px] mb-6" style={{ color: "var(--text)" }}>Account</h2>
      <SettingsWallets />
    </div>
  );
}

/**
 * Real stats, derived from tickets. Every number here used to be invented
 * ("SolDegen420", 127 bets, +$8,360).
 *
 * The one thing that must not go wrong: GROUP BY combo_id. A 4-leg combo is 4
 * ticket rows each carrying the FULL stake, so counting rows reports one $10
 * bet as "4 bets, $40 wagered" - and inflates every derived number with it.
 * Same trap that rendered one combo as four cards in History.
 */
function ProfilePage({ walletAddress, evmAddresses = [] }: { walletAddress: string; evmAddresses?: string[] }) {
  const { signedIn, myData, username } = useSession();
  const [shareOpen, setShareOpen] = React.useState(false);
  const [tickets, setTickets] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Reads go through /api/my-data, scoped SERVER-SIDE to the session's proven
    // addresses. walletAddress/evmAddresses props stay but no longer drive the
    // query - the session is the source of truth for whose bets these are.
    if (!signedIn) { setTickets([]); setLoading(false); return }
    (async () => {
      try {
        const res = await myData('tickets');
        // my-data returns newest-first; the streak calc below counts
        // chronologically, so restore oldest-first to keep streaks correct.
        setTickets((res?.tickets || []).slice().reverse());
      } catch (err) {
        console.error('Failed to fetch profile stats:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = React.useMemo(() => {
    // One entry per BET. Combo legs collapse into their combo_id.
    const bets: Record<string, any[]> = {};
    const order: string[] = [];
    for (const t of tickets) {
      const k = t.combo_id || t.id;
      if (!bets[k]) { bets[k] = []; order.push(k); }
      bets[k].push(t);
    }

    let won = 0, lost = 0, voided = 0, open = 0;
    let wagered = 0, returned = 0, biggestWin = 0;
    let streak = 0, chainSol = 0, chainArc = 0, singles = 0, combos = 0;

    for (const k of order) {
      const legs = bets[k];
      const first = legs[0];
      const isCombo = legs.length > 1;
      const stake = Number(first.stake) || 0;
      // Every leg carries the full stake, so the bet's stake is ONE leg's.
      const odds = isCombo ? Number(first.combo_odds || 1) : Number(first.odds || 1);

      if (isCombo) combos++; else singles++;
      if (first.chain === 'arc') chainArc++; else chainSol++;

      const anyVoid = legs.some((l) => l.battles?.status === 'void');
      const allDone = legs.every((l) => l.battles?.status === 'settled' || l.battles?.status === 'void');
      if (!allDone) { open++; continue; }

      wagered += stake;
      if (anyVoid) {
        voided++;
        returned += stake;   // refund: not a win, not a loss
        continue;
      }
      if (legs.every((l) => l.battles?.winner === l.side)) {
        won++;
        const payout = stake * odds;
        returned += payout;
        if (payout - stake > biggestWin) biggestWin = payout - stake;
        streak = streak >= 0 ? streak + 1 : 1;
      } else {
        lost++;
        streak = streak <= 0 ? streak - 1 : -1;
      }
    }

    const decided = won + lost;   // voids are not a result, so exclude them
    return {
      total: order.length, won, lost, voided, open,
      winRate: decided ? ((won / decided) * 100).toFixed(1) + '%' : '—',
      wagered, returned, pnl: returned - wagered,
      biggestWin, streak, chainSol, chainArc, singles, combos,
      since: tickets.length ? new Date(tickets[0].created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—',
    };
  }, [tickets]);

  if (!walletAddress && !evmAddresses.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Connect your wallet to see your stats</p>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p style={{ color: "var(--text-soft)" }}>Loading stats...</p>
    </div>
  );

  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

  return (
    <div className="rounded-[24px] bg-[var(--panel)] p-8" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar seed={username} size={48} />
          <h2 className="font-display text-[30px]" style={{ color: "var(--text)" }}>Stats</h2>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium" style={{ color: "var(--text-soft)" }}>Betting since {stats.since}</p>
          <button
            onClick={() => setShareOpen(true)}
            className="rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.98]"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", color: "var(--accent)" }}
          >
            Share my stats
          </button>
        </div>
      </div>
      <ShareStatsModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        username={username}
        stats={{ winRate: stats.winRate, won: stats.won, lost: stats.lost, total: stats.total, pnl: stats.pnl, since: stats.since }}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Net P&L" value={money(stats.pnl)} tone={stats.pnl > 0 ? 'pos' : stats.pnl < 0 ? 'neg' : undefined} />
        <InfoCard label="Win Rate" value={stats.winRate} sub={`${stats.won}W / ${stats.lost}L`} />
        <InfoCard label="Total Wagered" value={money(stats.wagered)} />
        <InfoCard label="Total Returned" value={money(stats.returned)} />

        <InfoCard label="Bets Placed" value={String(stats.total)} sub={`${stats.singles} single / ${stats.combos} combo`} />
        <InfoCard label="Biggest Win" value={money(stats.biggestWin)} tone={stats.biggestWin > 0 ? 'pos' : undefined} />
        <InfoCard
          label="Current Streak"
          value={stats.streak === 0 ? '—' : `${Math.abs(stats.streak)} ${stats.streak > 0 ? 'W' : 'L'}`}
          tone={stats.streak > 0 ? 'pos' : stats.streak < 0 ? 'neg' : undefined}
        />
        <InfoCard label="By Chain" value={`${stats.chainSol} / ${stats.chainArc}`} sub="Solana / Arc" />

        {stats.open > 0 && <InfoCard label="Still Running" value={String(stats.open)} sub="not counted above" />}
        {stats.voided > 0 && <InfoCard label="Void" value={String(stats.voided)} sub="refunded, excluded from win rate" />}
      </div>
    </div>
  );
}

function InfoCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-[14px] p-4" style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-2 font-semibold" style={{ color: tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : "var(--text)" }}>{value}</p>
      {sub && <p className="mt-1 text-[11px]" style={{ color: "var(--text-soft)" }}>{sub}</p>}
    </div>
  );
}

function Footer({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="mt-12 border-t bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto grid max-w-[1700px] gap-8 px-4 py-12 sm:px-6 xl:grid-cols-[1.2fr_1fr_1fr] xl:px-8">
        <div>
          <p className="text-2xl font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>PREDA</p>
          <p className="mt-3 max-w-lg text-sm leading-7" style={{ color: "var(--text-soft)" }}>
            <span className="font-medium" style={{ color: "var(--text)" }}>First crypto competition market.</span>{" "}
            Battle coins, build parlays, and set records.
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5 text-sm">
            <span className="rounded-full px-3.5 py-1.5 text-[13px] font-medium" style={{ background: "var(--panel-2)", color: "var(--text-2)" }}>
              Built by humans and AI
            </span>
            <span className="rounded-full px-3.5 py-1.5 text-[13px] font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              Live on Solana
            </span>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Product</p>
          <div className="mt-4 space-y-2.5 text-sm" style={{ color: "var(--text-soft)" }}>
            <button onClick={() => onNavigate("/")} className="block transition hover:text-[var(--text)]">Arena</button>
            <button onClick={() => onNavigate("/news")} className="block transition hover:text-[var(--text)]">News</button>
            <button onClick={() => onNavigate("/leaderboard")} className="block transition hover:text-[var(--text)]">Leaderboard</button>
            <button onClick={() => onNavigate("/how-to-play")} className="block transition hover:text-[var(--text)]">How to Play</button>
            <button onClick={() => onNavigate("/support")} className="block transition hover:text-[var(--text)]">Support</button>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Community</p>
          <div className="mt-4 space-y-2.5 text-sm" style={{ color: "var(--text-soft)" }}>
            <a href="https://x.com" target="_blank" rel="noreferrer" className="block transition hover:text-[var(--text)]">X / Twitter</a>
            <a href="https://discord.com" target="_blank" rel="noreferrer" className="block transition hover:text-[var(--text)]">Discord</a>
            <a href="https://t.me" target="_blank" rel="noreferrer" className="block transition hover:text-[var(--text)]">Telegram</a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="block transition hover:text-[var(--text)]">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function AuthSection() {
  const { login, authenticated, logout } = usePrivy();
  const { theme, toggle } = useTheme();
  const { signedIn, username, signIn, signOut } = useSession();
  const { disconnect: disconnectSolana } = useWallet();

  // One logout clears everything: session token, Privy (EVM), and the Solana
  // adapter. Each used to disconnect independently, so signing out left the
  // Solana wallet still connected.
  const logoutAll = async () => {
    signOut();
    try { await disconnectSolana(); } catch { /* not connected */ }
    try { await logout(); } catch { /* privy already out */ }
  };




  return (
    <div className="flex items-center justify-between w-full px-2">
      {/* LEFT GROUP */}
      <div className="flex items-center gap-2">
        {signedIn ? (
          <>
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {username ? `@${username}` : "Signed in"}
            </div>
            <button
              onClick={logoutAll}
              className="inline-flex items-center justify-center h-9 px-4 rounded-[8px] text-sm font-medium transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] hover:bg-[var(--panel-2)] active:scale-[0.98]"
              style={{ background: "var(--panel-2)", color: "var(--text-2)" }}
            >
              Logout
            </button>
          </>
        ) : authenticated ? (
          // Connected via Privy but the session isn't signed yet - this is the
          // state that used to render a bogus @User. Nudge them to finish.
          <button
            onClick={signIn}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-[8px] text-[var(--panel)] font-medium text-sm transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] hover:opacity-90 active:scale-[0.98]"
            style={{ background: "var(--text)" }}
          >
            Finish sign-in
          </button>
        ) : (
          <button
            onClick={login}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-[8px] text-[var(--panel)] font-medium text-sm transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] hover:opacity-90 active:scale-[0.98]"
            style={{ background: "var(--text)" }}
          >
            Login with X
          </button>
        )}
      </div>

      {/* RIGHT GROUP */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border transition-all hover:bg-[var(--panel-2)] active:scale-[0.96]"
          style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text-2)" }}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <WalletMultiButton style={{ borderRadius: "8px", background: "var(--brand-grad)", color: "#fff", fontWeight: 500, fontSize: "14px", height: "36px", padding: "0 16px", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)", transition: "all 0.15s" }} />
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _PredaAuthControls({
  accentColor = "var(--accent-2)",
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
        <div className="text-sm" style={{ color: "var(--text)" }}>
          {twitterUsername || "Connected"}
        </div>
      )}

      <WalletMultiButton style={{ borderRadius: "8px", background: "var(--brand-grad)", color: "#fff", fontWeight: 500, fontSize: "14px", height: "36px", padding: "0 16px", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)", transition: "all 0.15s" }} />

      {walletAddress ? (
        <div className="text-xs text-gray-400">
          {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
        </div>
      ) : null}

      {authenticated ? (
        <button
          onClick={() => logout()}
          className="rounded-2xl border px-3 py-2 text-sm text-[var(--text)]"
          style={{ borderColor: accentColor }}
        >
          Logout
        </button>
      ) : null}
    </div>
  );
}

function useCountdown(endTime: string) {
  const [timeLeft, setTimeLeft] = React.useState('')
  React.useEffect(() => {
    if (!endTime) { setTimeLeft('Unknown'); return }
    function calc() {
      const diff = new Date(endTime).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Settling...'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`)
    }
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [endTime])
  return timeLeft
}

function RunningTicketCard({ ticket }: { ticket: any }) {
  const battle = ticket.battles
  const timeLeft = useCountdown(battle?.end_time || '')
  if (!battle) return null

  const isCombo = !!ticket.combo_id
  const pick = ticket.side === 1 ? battle?.coin_a : ticket.side === 2 ? battle?.coin_b : 'Draw'
  const potentialWin = (ticket.stake * ticket.odds).toFixed(2)

  return (
    <div className="rounded-[18px] p-5 bg-[var(--panel)]" style={{ boxShadow: isCombo ? "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px var(--chain-arc-soft)" : "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(20,20,30,0.05)" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[15px]" style={{ color: "var(--text)" }}>{battle?.coin_a} vs {battle?.coin_b}</p>
            <ChainBadge chain={ticket.chain} />
            {isCombo && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>COMBO LEG</span>}
          </div>
          <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-soft)" }}>{battle?.league} · {battle?.duration}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] px-3 py-1 rounded-full font-semibold mb-1" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            {timeLeft}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[12px] p-3" style={{ background: "var(--panel-2)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-muted)" }}>Your Pick</p>
          <p className="font-semibold" style={{ color: "var(--text)" }}>{pick}</p>
          <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-soft)" }}>@ {ticket.odds}x</p>
        </div>
        <div className="rounded-[12px] p-3" style={{ background: "var(--panel-2)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-muted)" }}>Stake</p>
          <p className="font-semibold" style={{ color: "var(--text)" }}>${ticket.stake}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>To Win</p>
          <p className="font-semibold" style={{ color: COLORS.accent }}>${potentialWin}</p>
        </div>
      </div>
      {isCombo && (
        <p className="text-xs mt-3 text-center px-3 py-2 rounded-xl" style={{ background: 'rgba(244,63,94,0.08)', color: 'var(--neg)' }}>
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" /> Combo — all {ticket.combo_legs} legs must win
        </p>
      )}
      <BookingCodeRow code={ticket.share_code} />
    </div>
  )
}

// ── Shared running-bet helpers ───────────────────────────────────────────────
async function ticketRobustCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok
  } catch { return false }
}

// Arc and Solana bets are visually identical otherwise, but they settle on
// completely different rails - different contract, different money, different
// failure modes. When something looks wrong, the first question is always
// "which chain?", so put the answer on the ticket.
function ChainBadge({ chain }: { chain?: string }) {
  const isArc = chain === 'arc'
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
      style={{
        background: isArc ? 'var(--chain-arc-soft)' : 'var(--accent-soft)',
        color: isArc ? 'var(--chain-arc)' : 'var(--accent)',
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: isArc ? 'var(--chain-arc)' : 'var(--accent)' }} />
      {isArc ? 'Arc' : 'Solana'}
    </span>
  )
}

function legStatus(battle: any, side: number): { label: string; tone: string; Icon: any } {
  const st = battle?.status
  if (st === 'void') return { label: 'Void', tone: 'var(--text-muted)', Icon: MinusCircle }
  if (st === 'settled') {
    return battle.winner === side
      ? { label: 'Won', tone: 'var(--pos)', Icon: Trophy }
      : { label: 'Lost', tone: 'var(--neg)', Icon: XCircle }
  }
  return { label: 'Running', tone: 'var(--accent)', Icon: Clock }
}

function StatusPill({ battle, side }: { battle: any; side: number }) {
  const { label, tone, Icon } = legStatus(battle, side)
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: 'rgba(255,255,255,0.05)', color: tone }}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  )
}

function LegCountdown({ endTime, status }: { endTime: string; status?: string }) {
  const t = useCountdown(endTime)
  const label = status === 'settled' ? 'Ended' : status === 'void' ? 'Voided' : t
  return <span className="text-xs font-medium" style={{ color: 'var(--text-soft)' }}>{label}</span>
}

function BookingCodeRow({ code }: { code?: string | null }) {
  const [copied, setCopied] = React.useState(false)
  if (!code) return null
  const copy = async () => {
    const ok = await ticketRobustCopy(code)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }
  return (
    <div className="mt-3 flex items-center justify-between rounded-[10px] px-3 py-2.5" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>Booking code</p>
        <p className="font-mono text-sm font-bold tracking-widest" style={{ color: "var(--text)" }}>{code}</p>
      </div>
      <button onClick={copy} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
        style={{ background: copied ? 'var(--pos-soft)' : 'var(--brand-grad)', color: copied ? 'var(--pos)' : '#fff' }}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function ComboTicketCard({ legs }: { legs: any[] }) {
  const [expanded, setExpanded] = React.useState(false)
  const firstLeg = legs[0]
  const comboOdds = firstLeg.combo_odds || legs.reduce((a, t) => a * t.odds, 1)
  const stake = firstLeg.stake
  const potentialWin = (stake * comboOdds).toFixed(2)
  const allEndTimes = legs.map(l => l.battles?.end_time || '').filter(Boolean)
  const latestEnd = allEndTimes.sort().pop() || ''
  const timeLeft = useCountdown(latestEnd)
  const code = legs.find((l) => l.share_code)?.share_code

  return (
    <div className="rounded-[18px] p-5 bg-[var(--panel)]" style={{ boxShadow: "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(124,58,237,0.1)" }}>
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-start justify-between mb-4 text-left">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[15px]" style={{ color: "var(--text)" }}>Combo Bet</p>
            <ChainBadge chain={firstLeg.chain} />
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {legs.length} LEGS
            </span>
          </div>
          <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-soft)" }}>All legs must win · {comboOdds.toFixed(2)}x combined</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-3 py-1 rounded-full font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{timeLeft}</span>
          <ChevronDown className="h-4 w-4 transition-transform" style={{ color: 'var(--text-soft)', transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </div>
      </button>

      {/* Each leg — expanded reveals per-leg countdown + status */}
      <div className="space-y-2 mb-3">
        {legs.map((leg, i) => {
          const b = leg.battles
          const pick = leg.side === 1 ? b?.coin_a : leg.side === 2 ? b?.coin_b : 'Draw'
          return (
            <div key={leg.id} className="rounded-[10px] px-3 py-2.5" style={{ background: 'var(--panel-2)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>Leg {i + 1}</span>
                <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{b?.coin_a} vs {b?.coin_b}</span>
                <span style={{ color: "var(--accent)" }} className="text-sm font-semibold">{pick}</span>
              </div>
              {expanded && (
                <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                  <LegCountdown endTime={b?.end_time || ''} status={b?.status} />
                  <StatusPill battle={b} side={leg.side} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>Combined Odds</p>
          <p className="text-white font-semibold">{comboOdds.toFixed(2)}x</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>Stake</p>
          <p className="text-white font-semibold">${stake}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>To Win</p>
          <p className="font-semibold" style={{ color: COLORS.accent }}>${potentialWin}</p>
        </div>
      </div>

      {expanded ? (
        <BookingCodeRow code={code} />
      ) : (
        <p className="text-xs mt-3 text-center px-3 py-2 rounded-xl" style={{ background: 'rgba(244,63,94,0.08)', color: 'var(--neg)' }}>
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" /> If any leg loses, entire combo is lost
        </p>
      )}
    </div>
  )
}

/**
 * A settled bet has THREE outcomes, not two. History judged `won = winner ===
 * side`, a boolean - so every void bet rendered as "Lost", telling users they
 * lost money that was refunded to them.
 *
 * For a combo the whole group decides: any void leg voids the bet (matching
 * settleComboTickets), any lost leg loses it, and it wins only if every leg won.
 */
function betOutcome(legs: any[]): { kind: 'won' | 'lost' | 'void'; label: string; tone: string; Icon: any } {
  if (legs.some((l) => l.battles?.status === 'void')) {
    return { kind: 'void', label: 'Void', tone: 'var(--text-soft)', Icon: MinusCircle }
  }
  if (legs.every((l) => l.battles?.winner === l.side)) {
    return { kind: 'won', label: 'Won', tone: COLORS.accent, Icon: Trophy }
  }
  return { kind: 'lost', label: 'Lost', tone: 'var(--neg)', Icon: XCircle }
}

function HistoryPage({ walletAddress, evmAddresses = [] }: { walletAddress: string, evmAddresses?: string[] }) {
  const { signedIn, signIn, myData } = useSession()
  const [tickets, setTickets] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    // Reads now go through the authenticated endpoint, scoped SERVER-SIDE to the
    // session's addresses (every linked wallet, not just the connected one).
    // walletAddress/evmAddresses props are left in place but no longer drive the
    // query - the session is the source of truth for whose bets these are.
    if (!signedIn) { setLoading(false); return }
    async function fetchHistory() {
      try {
        const res = await myData('tickets')
        const data = res?.tickets || []
        // Void belongs here as much as settled. It used to be filtered out,
        // so a refunded bet showed in NEITHER view: Running Bets fetches
        // claimed=false and settlement marks void combos claimed=true after
        // refunding. The user got their money back with no record of it.
        setTickets(data.filter((t: any) =>
          t.battles?.status === 'settled' || t.battles?.status === 'void'))
      } catch (err) {
        console.error('Failed to fetch history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  // One card per BET, not per row. A 4-leg combo is 4 ticket rows sharing a
  // combo_id, and rendering them individually showed one bet as four cards -
  // some "Won", some "Lost" - which is meaningless: a combo pays only if every
  // leg wins. Same grouping RunningBetsPage already does.
  const historyGroups = React.useMemo(() => {
    const combos: Record<string, any[]> = {}
    const out: { key: string; legs: any[] }[] = []
    for (const t of tickets) {
      if (t.combo_id) {
        if (!combos[t.combo_id]) { combos[t.combo_id] = []; out.push({ key: t.combo_id, legs: combos[t.combo_id] }) }
        combos[t.combo_id].push(t)
      } else {
        out.push({ key: t.id, legs: [t] })
      }
    }
    return out
  }, [tickets])

  if (!walletAddress && !evmAddresses.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Sign in to see your bet history</p>
      <p className="mt-2 text-sm max-w-xs" style={{ color: COLORS.textSoft }}>A quick wallet signature - no transaction, no fee - proves these bets are yours.</p>
      <button
        onClick={signIn}
        className="mt-5 rounded-[12px] px-5 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
        style={{ background: "var(--brand-grad)" }}
      >
        Sign in with wallet
      </button>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p style={{ color: COLORS.textSoft }}>Loading history...</p>
    </div>
  )

  if (!tickets.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>No settled bets yet</p>
      <p className="mt-2 text-sm" style={{ color: COLORS.textSoft }}>Your completed battles will appear here</p>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 xl:px-8">
      <h2 className="text-2xl font-semibold tracking-[-0.02em] mb-6" style={{ color: "var(--text)" }}>Bet History</h2>
      <div className="grid gap-4">
        {historyGroups.map(({ key, legs }) => {
          const ticket = legs[0]
          const battle = ticket.battles
          const isCombo = legs.length > 1
          const outcome = betOutcome(legs)
          const effOdds = isCombo ? Number(ticket.combo_odds || 1) : Number(ticket.odds)
          const potentialWin = (ticket.stake * effOdds).toFixed(2)
          const changeA = battle?.start_price_a && battle?.final_price_a 
            ? (((battle.final_price_a - battle.start_price_a) / battle.start_price_a) * 100).toFixed(2)
            : null
          const changeB = battle?.start_price_b && battle?.final_price_b
            ? (((battle.final_price_b - battle.start_price_b) / battle.start_price_b) * 100).toFixed(2)
            : null

          return (
            <div key={key} className="rounded-[18px] p-5 bg-[var(--panel)]" style={{ boxShadow: "0 1px 3px rgba(20,20,30,0.04), 0 8px 24px rgba(20,20,30,0.05)" }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[17px]" style={{ color: "var(--text)" }}>
                      {isCombo ? `Combo · ${legs.length} legs` : `${battle?.coin_a} vs ${battle?.coin_b}`}
                    </p>
                    <ChainBadge chain={ticket.chain} />
                  </div>
                  <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-soft)" }}>
                    {isCombo ? `${effOdds.toFixed(2)}x combined · all legs must win` : `${battle?.league} · ${battle?.duration}`}
                  </p>
                </div>
                <span className="text-sm px-3 py-1 rounded-full font-semibold" style={{
                  background: outcome.kind === 'won' ? 'var(--accent-soft)'
                            : outcome.kind === 'void' ? 'rgba(255,255,255,0.06)'
                            : 'var(--neg-soft)',
                  color: outcome.tone,
                }}>
                  <span className="inline-flex items-center gap-1"><outcome.Icon className="h-3.5 w-3.5" /> {outcome.label}</span>
                </span>
              </div>

              {/* Per-leg breakdown - without it a combo card cannot show WHICH
                  leg killed the bet. */}
              {isCombo && (
                <div className="space-y-1.5 mb-4">
                  {legs.map((leg: any, i: number) => {
                    const lb = leg.battles
                    const pick = leg.side === 1 ? lb?.coin_a : leg.side === 2 ? lb?.coin_b : 'Draw'
                    const legOut = betOutcome([leg])
                    return (
                      <div key={leg.id} className="flex items-center justify-between rounded-[10px] px-3 py-2" style={{ background: 'var(--panel-2)' }}>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Leg {i + 1}</span>
                        <span className="text-sm" style={{ color: 'var(--text)' }}>{lb?.coin_a} vs {lb?.coin_b}</span>
                        <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{pick}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: legOut.tone }}>
                          <legOut.Icon className="h-3 w-3" /> {legOut.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
                  <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>Your Pick</p>
                  <p className="font-semibold" style={{ color: "var(--text)" }}>
                    {isCombo ? `${legs.length} selections`
                     : ticket.side === 1 ? battle?.coin_a : ticket.side === 2 ? battle?.coin_b : 'Draw'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>@ {effOdds.toFixed(2)}x</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
                  <p className="text-xs mb-1" style={{ color: COLORS.textSoft }}>{outcome.label}</p>
                  <p className="font-semibold" style={{ color: outcome.tone }}>
                    {outcome.kind === 'won'  ? `+$${potentialWin}`
                     : outcome.kind === 'void' ? `$${ticket.stake} refunded`
                     : `-$${ticket.stake}`}
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textSoft }}>Stake: ${ticket.stake}</p>
                </div>
              </div>

              {!isCombo && (changeA || changeB) && (
                <div className="rounded-xl p-3 grid grid-cols-2 gap-3" style={{ background: COLORS.accentSoft }}>
                  <div>
                    <p className="text-xs" style={{ color: COLORS.textSoft }}>{battle?.coin_a} move</p>
                    <p className="font-semibold text-sm mt-1" style={{ color: Number(changeA) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                      {Number(changeA) >= 0 ? '+' : ''}{changeA}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: COLORS.textSoft }}>{battle?.coin_b} move</p>
                    <p className="font-semibold text-sm mt-1" style={{ color: Number(changeB) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
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

function RunningBetsPage({ walletAddress, evmAddresses = [] }: { walletAddress: string, evmAddresses?: string[] }) {
  const { signedIn, signIn, myData } = useSession()
  const [tickets, setTickets] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    // Reads go through /api/my-data, scoped SERVER-SIDE to the session's proven
    // addresses. The old query filtered claimed=false in SQL; my-data returns
    // ALL tickets newest-first, so that filter moves client-side below (same
    // meaning), and no reordering is needed.
    if (!signedIn) { setTickets([]); setLoading(false); return }
    async function fetchTickets() {
      try {
        const res = await myData('tickets')
        // Unclaimed = not fully resolved. Combo legs stay claimed=false (settled
        // ones too) until the whole combo resolves, so combos render complete
        // with per-leg Won/Lost pills. Won AND lost bets flip claimed=true at
        // settlement and move to history.
        setTickets((res?.tickets || []).filter((t: any) =>
          t.claimed === false && t.battles && t.battles?.coin_a))
      } catch (err) {
        console.error('Failed to fetch tickets:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchTickets()
    const interval = setInterval(fetchTickets, 30000)
    return () => clearInterval(interval)
  }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!signedIn) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Sign in to see your bets</p>
      <p className="mt-2 text-sm max-w-xs" style={{ color: COLORS.textSoft }}>A quick wallet signature - no transaction, no fee - proves these bets are yours.</p>
      <button
        onClick={signIn}
        className="mt-5 rounded-[12px] px-5 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
        style={{ background: "var(--brand-grad)" }}
      >
        Sign in with wallet
      </button>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p style={{ color: COLORS.textSoft }}>Loading bets...</p>
    </div>
  )

  if (!tickets.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>No bets yet</p>
      <p className="mt-2 text-sm" style={{ color: COLORS.textSoft }}>Place your first bet on the Arena</p>
    </div>
  )

  // Group combo tickets together, show singles separately
  const comboGroups: Record<string, any[]> = {}
  const singleTickets: any[] = []

  for (const ticket of tickets) {
    if (ticket.combo_id) {
      if (!comboGroups[ticket.combo_id]) comboGroups[ticket.combo_id] = []
      comboGroups[ticket.combo_id].push(ticket)
    } else {
      singleTickets.push(ticket)
    }
  }

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 xl:px-8">
      <h2 className="text-2xl font-semibold tracking-[-0.02em] mb-6" style={{ color: "var(--text)" }}>My Bets</h2>
      <div className="grid gap-4">
        {/* Combo bets grouped */}
        {Object.entries(comboGroups).map(([comboId, legs]) => (
          <ComboTicketCard key={comboId} legs={legs} />
        ))}
        {/* Single bets */}
        {singleTickets.map((ticket) => (
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
  // When the server rejects a leg for odds drift we sync that leg to the
  // server's price and flip the button to a confirm state for one tap.
  const [requoteReady, setRequoteReady] = useState(false);
  const [betCodeSheetOpen, setBetCodeSheetOpen] = useState(false);
  const [slipChain, setSlipChain] = useState<'solana' | 'arc'>('solana');
  const { placeBet: arcPlaceBet, placeCombo: arcPlaceCombo, loading: arcLoading } = useArcArena();
  const { signedIn, signIn } = useSession();  // betting gate: bets require a session
  const [oddsFlash, setOddsFlash] = useState<Record<string, 'up' | 'down'>>({});
  const flashTimers = React.useRef<Record<string, any>>({});
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<{
    code: string; coinA: string; coinB: string; side: number; odds: number; stake: number; legCount: number;
  } | null>(null);
  const { matches: supabaseMatches } = useBattles();
  const [liveMatches, setLiveMatches] = useState<Match[]>(initialMatches);
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const { wallets: privyWallets } = useWallets();

  // Every EVM address this user might have bet from. Three bugs lived here:
  //  - the root never called useWallets(), so Privy's embedded wallet was
  //    invisible and only window.ethereum.selectedAddress was consulted;
  //  - selectedAddress is deprecated and non-reactive - null on first render;
  //  - it returns LOWERCASE, but tickets store CHECKSUMMED addresses (they come
  //    from the on-chain BetPlaced event), and .in() is an exact string match,
  //    so even a populated value matched nothing.
  // A user can hold both an embedded wallet and MetaMask, so pass them all.
  const evmAddresses = useMemo(() => {
    const raw = [
      ...privyWallets.filter((w) => w.chainId?.startsWith("eip155:")).map((w) => w.address),
      (typeof window !== "undefined" && (window as any).ethereum?.selectedAddress) || "",
    ].filter(Boolean);
    const out: string[] = [];
    for (const a of raw) {
      try {
        const c = getAddress(a as `0x${string}`);
        if (!out.includes(c)) out.push(c);
      } catch { /* not a valid address */ }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privyWallets.map((w) => w.address).join(",")]);

  // Arc needs an EVM wallet - either Privy's embedded one or MetaMask.
  const arcConnected = evmAddresses.length > 0;


  useEffect(() => {
    if (supabaseMatches.length > 0) {
      setLiveMatches(supabaseMatches as any)
    }
  }, [supabaseMatches]);

  // LIVE SLIP SYNC. The odds engine recomputes every 2s, but the slip used to
  // hold whatever odds were showing at tap time - so a slip left open drifted
  // badly (we saw 30%+) and the server bounced nearly every bet for a requote.
  // Each leg now tracks its match's live odds, with a brief up/down flash so the
  // move is visible rather than sneaky. Guards:
  //   - Skipped while requoteReady: the user is confirming a SERVER-quoted price;
  //     a local tick must not overwrite that handshake.
  //   - Locked legs are frozen (they can't be bet anyway).
  //   - Returns `prev` untouched when nothing moved, so this can never loop.
  useEffect(() => {
    if (requoteReady) return;
    if (!liveMatches.length) return;

    setSlipSelections((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const moved: Record<string, 'up' | 'down'> = {};

      const next = prev.map((sel) => {
        const match = liveMatches.find((m) => m.id === sel.matchId);
        if (!match || match.bettingLocked) return sel;
        const live =
          sel.chosenSide === 'left' ? match.left?.odds
          : sel.chosenSide === 'right' ? match.right?.odds
          : match.draw?.odds;
        if (typeof live !== 'number' || !(live > 0)) return sel;
        const fresh = Number(live.toFixed(2));
        if (fresh === Number(sel.oddsAtPick.toFixed(2))) return sel;
        changed = true;
        moved[sel.matchId] = fresh > sel.oddsAtPick ? 'up' : 'down';
        return { ...sel, oddsAtPick: fresh };
      });

      if (!changed) return prev;

      queueMicrotask(() => {
        setOddsFlash((f) => ({ ...f, ...moved }));
        for (const id of Object.keys(moved)) {
          clearTimeout(flashTimers.current[id]);
          flashTimers.current[id] = setTimeout(() => {
            setOddsFlash((f) => {
              const rest = { ...f };
              delete rest[id];
              return rest;
            });
          }, 900);
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMatches, requoteReady]);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => { Object.values(timers).forEach((t) => clearTimeout(t)); };
  }, []);

  // Restore a shared slip from ?betcode=CODE (set by BetSharePage). Rebuilds
  // every leg against the CURRENT live matches so odds are fresh; legs whose
  // battle has ended are skipped. Runs once liveMatches is populated.
  const restoredCodeRef = React.useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const betcode = params.get('betcode');
    if (!betcode) return;
    if (restoredCodeRef.current === betcode) return;
    // Gate on REAL battles — liveMatches starts as mock data with different
    // ids, which matches nothing and wrongly reports 'expired', then locks
    // the ref against a retry once the real battles arrive.
    if (!supabaseMatches.length) return;

    (async () => {
      try {
        const { supabase } = await import('./lib/supabase');
        const { data } = await supabase
          .from('bet_shares').select('legs, side, battle_id').eq('code', betcode.toUpperCase()).single();
        if (!data) {
          window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'That booking code was not found.', type: 'error' } }));
          return;
        }

        const legs: { battle_id: string; side: number }[] =
          Array.isArray(data.legs) && data.legs.length
            ? data.legs
            : [{ battle_id: data.battle_id, side: data.side }];

        const restored: SlipSelection[] = [];
        let expired = 0;
        for (const leg of legs) {
          const match = supabaseMatches.find((m: any) => m.id === leg.battle_id);
          if (!match || match.bettingLocked) { expired++; continue; }
          const chosenSide: Side = leg.side === 1 ? 'left' : leg.side === 2 ? 'right' : 'draw';
          const oddsAtPick =
            chosenSide === 'left' ? match.left.odds : chosenSide === 'right' ? match.right.odds : match.draw.odds;
          const pickLabel =
            chosenSide === 'left' ? match.left.ticker : chosenSide === 'right' ? match.right.ticker : 'Draw';
          restored.push({
            matchId: match.id,
            arcBattleId: match.arcBattleId ?? null,
            matchTitle: match.title,
            chosenSide,
            pickLabel,
            oddsAtPick,
            duration: match.duration as MatchDuration,
          });
        }

        restoredCodeRef.current = betcode;

        if (restored.length) {
          setSlipSelections(restored);
          setSlipOpen(true);
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: expired > 0
                ? `Loaded ${restored.length} leg(s); ${expired} expired and were skipped.`
                : `Bet loaded — ${restored.length} leg(s) ready. Set your stake and place.`,
              type: 'success',
            },
          }));
        } else {
          window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'This shared bet has expired — its battles already ended.', type: 'error' } }));
        }
      } catch (e) {
        console.error('slip restore failed:', e);
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete('betcode');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, supabaseMatches]);

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
      "/settings": "ACCOUNT",
      "/running": "MY BETS",
      "/history": "MY BETS",
      "/news": "PRODUCT",
      "/leaderboard": "PRODUCT",
      "/how-to-play": "PRODUCT",
      "/support": "PRODUCT",
      // /profile was the only MY BETS route missing from this map, so it never
      // opened its own section - the link existed but stayed folded inside a
      // collapsed accordion, which is why it looked missing on desktop.
      "/profile": "MY BETS",
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

  // (Removed) Random odds jitter that used to run every 10s — it was leftover
  // mockup noise that corrupted the real Pyth-driven odds from useBattles.

  useEffect(() => {
    if (slipSelections.length > 0) {
      setSlipOpen(true);
    }
  }, [slipSelections.length]);

  // If a leg that isn't mirrored to Arc enters the slip while Arc is selected,
  // fall back to Solana. Leaving Arc selected would let them tap Place and eat
  // a battle_not_on_arc revert with no explanation.
  useEffect(() => {
    if (slipChain !== 'arc') return;
    if (slipSelections.some((s) => s.arcBattleId == null)) setSlipChain('solana');
  }, [slipChain, slipSelections]);

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
    if (match.bettingLocked) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Betting is closed for this battle', type: 'error' } }))
      return
    }
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
        arcBattleId: match.arcBattleId ?? null,
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
      case "/settings":
        return <SettingsPage />;
      case "/profile":
        return <ProfilePage walletAddress={connected && publicKey ? publicKey.toBase58() : ""} evmAddresses={evmAddresses} />;
      case "/running":
        return <RunningBetsPage walletAddress={connected && publicKey ? publicKey.toBase58() : ""} evmAddresses={evmAddresses} />;
      case "/history":
        return <HistoryPage walletAddress={connected && publicKey ? publicKey.toBase58() : ""} evmAddresses={evmAddresses} />;
      default:
        return (
          <section className="overflow-hidden rounded-[24px] border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
            <div className="px-5 pt-6 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-[32px]" style={{ color: "var(--text)" }}>Arena</h2>
                  <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-soft)" }}>
                    Full market selections with live and upcoming coin battles.
                  </p>
                </div>
                <div className="hidden rounded-full px-3 py-2 text-xs font-bold sm:block" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
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
                <div className="rounded-[20px] border border-dashed p-8 text-center xl:col-span-2" style={{ borderColor: "var(--border)" }}>
                  <p className="text-lg font-bold" style={{ color: "var(--text)" }}>No markets in this filter right now.</p>
                  <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-soft)" }}>
                    Switch board, token class, or market category.
                  </p>
                </div>
              )}
            </div>
          </section>
        );
    }
  };

  const sideNumOf = (s: SlipSelection): 1 | 2 | 3 =>
    s.chosenSide === 'left' ? 1 : s.chosenSide === 'right' ? 2 : 3

  /**
   * Places the slip on Arc. Nothing like the Solana path: the money moves
   * on-chain from the user's own wallet, so there is no balance to debit and no
   * requote handshake - the server prices and SIGNS the odds, the contract
   * verifies that signature, and a stale quote simply expires (re-tap).
   *
   * The mirror is a separate step and can fail on its own. When it does the bet
   * is still real and still on-chain - say exactly that rather than implying it
   * failed.
   */
  const handlePlaceTicketArc = async () => {
    const totalStake = Number(stake)
    if (!(totalStake > 0)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Enter a stake', type: 'error' } }))
      return
    }
    if (!arcConnected) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Connect an EVM wallet to bet on Arc', type: 'error' } }))
      return
    }
    if (slipSelections.some((s) => s.arcBattleId == null)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Some selections are not on Arc yet', type: 'error' } }))
      return
    }

    const isCombo = slipSelections.length > 1
    const sel0 = slipSelections[0]
    const c0 = sel0.matchTitle.split(' vs ')[0]
    const c1 = sel0.matchTitle.split(' vs ')[1] || ''
    const legsForShare = slipSelections.map((sel) => ({
      battle_id: sel.matchId, side: sideNumOf(sel),
    }))

    // Code is generated PURE here (no DB write) so it can ride along with the
    // mirror, which stamps it onto the tickets with the service role. The
    // bet_shares row is saved only after the bet lands - a failed bet never
    // orphans a code.
    const { makeShareCode, saveBetShare } = await import('./utils/betShare')
    const code = makeShareCode()

    try {
      let txHash: string
      let legOdds: string[] | undefined

      if (isCombo) {
        const r = await arcPlaceCombo(
          slipSelections.map((s) => s.matchId),
          slipSelections.map((s) => sideNumOf(s)) as any,
          stake,
        )
        txHash  = r.txHash
        legOdds = r.legOdds
      } else {
        const s0 = slipSelections[0]
        const r = await arcPlaceBet(
          s0.matchId,
          BigInt(s0.arcBattleId as number),
          sideNumOf(s0) as any,
          stake,
        )
        txHash = r.txHash
      }

      const res = await fetch('/api/place-bet-arc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // A combo's battles are read from the ComboPlaced event; a single
          // needs the UUID so the server can cross-check the on-chain battleId.
          battle_id: isCombo ? undefined : slipSelections[0].matchId,
          tx_hash: txHash,
          // ComboPlaced omits per-leg odds; the server verifies their product
          // against the on-chain comboOdds before recording.
          leg_odds: legOdds,
          code,
        }),
      })

      if (!res.ok) {
        // The bet IS on-chain - only the mirror failed. Say that, don't imply
        // the money vanished.
        const { error } = await res.json()
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: `Bet placed on Arc but not recorded (${error}) - tx ${txHash.slice(0, 10)}...`,
            type: 'error',
          },
        }))
        setSlipSelections([])
        setSlipOpen(false)
        return
      }

      // Recorded. Save the share row now that tickets exist to restore to, then
      // open the modal - it doubles as the confirmation. Slip clearing is
      // deferred to its onClose so it can't re-render over the modal.
      try {
        await saveBetShare({
          code,
          legs: legsForShare,
          oddsAtShare: sel0.oddsAtPick,
          coinA: c0,
          coinB: c1,
          league: '',
          duration: sel0.duration,
          createdBy: evmAddresses[0] || '',
        })
        setShareData({
          code,
          coinA: c0,
          coinB: c1,
          side: sideNumOf(sel0),
          odds: isCombo ? slipSelections.reduce((a, x) => a * x.oddsAtPick, 1) : sel0.oddsAtPick,
          stake: totalStake,
          legCount: slipSelections.length,
        })
        setShareModalOpen(true)
      } catch (shareErr) {
        console.error('Share save failed:', shareErr)
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: isCombo ? 'Combo placed on Arc' : 'Bet placed on Arc', type: 'success' },
        }))
        setSlipSelections([])
        setSlipOpen(false)
      }
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Arc bet failed'
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
    }
  }

  const handlePlaceTicket = async () => {
    if (!slipSelections.length) return

    // BETTING GATE: must be logged in (session), not just wallet-connected.
    // Placed before the Arc/Solana split so ONE check covers both chains. In
    // practice this rarely triggers - auto-sign-in fires on wallet connect - so
    // it's the safety net for the edge case (connected but sign-in declined or
    // failed), and it's what ties every bet to a profile.
    if (!signedIn) {
      const ok = await signIn()
      if (!ok) {
        window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Sign in to place a bet', type: 'error' } }))
        return
      }
    }

    if (slipChain === 'arc') return handlePlaceTicketArc()

    // Solana from here. The wallet guard lives INSIDE this branch - it used to
    // sit at the top and would have blocked Arc-only users outright.
    if (!connected || !publicKey) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Connect your wallet first', type: 'error' } }))
      return
    }
    const walletAddr = publicKey.toBase58()
    const totalStake = Number(stake)

    const isCombo = slipSelections.length > 1
    const comboOdds = slipSelections.reduce((acc, sel) => acc * sel.oddsAtPick, 1)

    // Slip metadata + the booking code, computed up front. The code is PURE
    // here (no DB write yet) so it can be sent to the server, which stamps it
    // onto the ticket rows with the service role. The bet_shares row is saved
    // only AFTER the bet succeeds (below), so a failed bet never orphans a code.
    const sel0 = slipSelections[0]
    const c0 = sel0.matchTitle.split(' vs ')[0]
    const c1 = sel0.matchTitle.split(' vs ')[1] || ''
    const side0 = sel0.chosenSide === 'left' ? 1 : sel0.chosenSide === 'right' ? 2 : 3
    const legsForBet = slipSelections.map((sel) => ({
      battle_id: sel.matchId,
      side: sel.chosenSide === 'left' ? 1 : sel.chosenSide === 'right' ? 2 : 3,
    }))
    const { makeShareCode, saveBetShare } = await import('./utils/betShare')
    const code = makeShareCode()

    try {
      // The client no longer prices the bet, debits the balance, inserts the
      // ticket, or bumps the pool. It states intent; the server does the rest
      // inside one atomic transaction (place_bet), enforcing the 80% lock and
      // an atomic balance check that no client can race. `code` is passed so the
      // server can stamp it onto the tickets (RLS blocks a client-side stamp).
      const res = await fetch('/api/place-bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddr,
          stake: totalStake,
          legs: legsForBet.map((leg, i) => ({
            ...leg,
            odds: slipSelections[i].oddsAtPick,
          })),
          code,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        // A leg drifted past tolerance. The server returned that leg's id and
        // its current price - sync it into the slip and let the user confirm.
        // The server returns EVERY drifted leg (`drifted`), so a combo is
        // re-accepted in ONE tap instead of one tap per leg. Falls back to the
        // legacy single-leg shape if an older response is in flight.
        const driftedLegs: { battle_id: string; current: number }[] =
          Array.isArray(result.drifted) && result.drifted.length
            ? result.drifted
            : (result.battle_id && typeof result.current === 'number'
                ? [{ battle_id: result.battle_id, current: result.current }]
                : [])
        if (result.error === 'odds_changed' && driftedLegs.length) {
          setSlipSelections((prev) => prev.map((sel) => {
            const d = driftedLegs.find((x) => x.battle_id === sel.matchId)
            return d ? { ...sel, oddsAtPick: d.current } : sel
          }))
          setRequoteReady(true)
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: driftedLegs.length === 1
                ? `Odds moved to ${Number(driftedLegs[0].current).toFixed(2)} - tap again to confirm`
                : `Odds moved on ${driftedLegs.length} selections - tap again to confirm`,
              type: 'error',
            }
          }))
          return
        }
        const messages: Record<string, string> = {
          betting_locked: 'Betting is closed for one of your selections',
          battle_not_live: 'One of your selections is no longer live',
          battle_not_found: 'A selected battle no longer exists',
          insufficient_balance: 'Insufficient balance. Deposit more SOL to continue.',
          price_unavailable: 'Price feed unavailable — try again in a moment',
          invalid_odds: 'Odds changed while you were betting — refresh and retry',
          stake_too_small: 'Stake is too small',
        }
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: messages[result.error] || 'Bet failed', type: 'error' }
        }))
        return
      }

      setRequoteReady(false)

      // Bet placed. Persist the share row now that a ticket exists to restore to
      // (server has already stamped `code` onto the tickets), then open the share
      // modal - it doubles as the "ticket placed" confirmation. Slip clear +
      // balance refresh are deferred to the modal's onClose so they never
      // re-render on top of the freshly opened modal.
      try {
        await saveBetShare({
          code,
          legs: legsForBet,
          oddsAtShare: sel0.oddsAtPick,
          coinA: c0,
          coinB: c1,
          league: '',
          duration: sel0.duration,
          createdBy: walletAddr,
        })
        setShareData({
          code,
          coinA: c0,
          coinB: c1,
          side: side0,
          odds: isCombo ? comboOdds : sel0.oddsAtPick,
          stake: totalStake,
          legCount: slipSelections.length,
        })
        setShareModalOpen(true)
      } catch (e) {
        console.error('Share save failed:', e)
        // The bet DID place; only the share code failed. Confirm it and clear
        // the slip here since the modal won't open.
        window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Ticket placed', type: 'success' } }))
        setSlipSelections([])
        setSlipOpen(false)
        window.dispatchEvent(new Event('balance-refresh'))
      }
    } catch (err: any) {
      console.error('Failed to place ticket:', err)
      alert('Failed: ' + (err.message || err))
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
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
      <BetCodeSheet open={betCodeSheetOpen} onClose={() => setBetCodeSheetOpen(false)} />

      <MobileShell
        open={mobileSidebarOpen}
        setOpen={setMobileSidebarOpen}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenBetCode={() => setBetCodeSheetOpen(true)}
        onNavigate={(path) => navigate(path)}
        openSection={openSection}
        setOpenSection={setOpenSection}
        currentPath={location.pathname}
      />

      <SlipHandle open={slipOpen} setOpen={setSlipOpen} count={slipSelections.length} />
      <SlipDrawer open={slipOpen} items={slipSelections} stake={stake} setStake={setStake} onRemove={handleRemoveSelection} onPlaceTicket={handlePlaceTicket} onClose={() => setSlipOpen(false)} requoteReady={requoteReady} oddsFlash={oddsFlash} slipChain={slipChain} setSlipChain={setSlipChain} arcConnected={arcConnected} placing={arcLoading} />
      {shareData && (
        <BetShareModal
          open={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false)
            setSlipSelections([])
            setSlipOpen(false)
            setRequoteReady(false)
            window.dispatchEvent(new Event('balance-refresh'))
          }}
          code={shareData.code}
          coinA={shareData.coinA}
          coinB={shareData.coinB}
          side={shareData.side}
          odds={shareData.odds}
          stake={shareData.stake}
          legCount={shareData.legCount}
        />
      )}

      <div className={cx("transition-all duration-300", sidebarExpanded ? "lg:pl-[280px]" : "lg:pl-[86px]", "pt-[60px] pb-[80px] lg:pt-[72px] lg:pb-0")}>
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