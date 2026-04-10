import React, { useEffect, useMemo, \useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Gamepad2,
  HelpCircle,
  LayoutGrid,
  Lock,
  Mail,
  Menu,
  Newspaper,
  Phone,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { connectWallet, placeTicketOnChain } from "./lib/predaProgram";
const COLORS = {
  bg: "#050805",
  panel: "#091009",
  panelSoft: "#0d140d",
  line: "rgba(145,255,90,0.14)",
  lineStrong: "rgba(145,255,90,0.26)",
  accent: "#8dff4f",
  accentSoft: "rgba(141,255,79,0.12)",
  accentGlow: "rgba(141,255,79,0.16)",
  textSoft: "#91a28d",
};

const boardTabs = ["Live", "Upcoming"];
const classTabs = ["All", "Major", "Altcoins", "Meme"];
const matchDurations = ["All", "5m", "15m", "30m", "1h", "4h", "1D", "1W"];
const quickStakes = [10, 50, 100, 500];

const sidebarItems = [
  { label: "Arena", icon: LayoutGrid, href: "#arena" },
  { label: "Crypto", icon: Coins, href: "#arena" },
  { label: "Economy", icon: TrendingUp, href: "#arena", badge: "Soon" },
  { label: "Tribe Duel", icon: Shield, href: "#arena", badge: "Soon" },
  { label: "Sports", icon: Gamepad2, href: "#arena", badge: "Soon" },
  { label: "News", icon: Newspaper, href: "#news-anchor" },
  { label: "Leader Board", icon: Trophy, href: "#leaderboard" },
  { label: "How to Play", icon: Sparkles, href: "#how-to-play" },
];

const supportItems = [
  { label: "Help", icon: HelpCircle, href: "#help" },
  { label: "Contact Us", icon: Phone, href: "#contact" },
];

const showSlides = [
  {
    title: "PREDA ARENA",
    text: "First crypto competition market. Battle coins, build parlays, and set records.",
    cta: "Open Arena",
  },
  {
    title: "BUILT FOR FAST PICKS",
    text: "Pick left, draw, or right and keep the board full of live crypto selections.",
    cta: "View Markets",
  },
  {
    title: "COMING TO SOLANA",
    text: "Built by humans and ai on the solana blockchain for best user experience.",
    cta: "Join Waitlist",
  },
];

const coinIcons = {
  BTC: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/btc.png",
  ETH: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png",
  SOL: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png",
  AVAX: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/avax.png",
  XRP: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/xrp.png",
  BNB: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/bnb.png",
  DOGE: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/doge.png",
  PEPE: "https://assets.coingecko.com/coins/images/29850/standard/pepe-token.jpeg",
  TIA: "https://assets.coingecko.com/coins/images/31967/standard/tia.jpg",
  INJ: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/inj.png",
  JUP: "https://assets.coingecko.com/coins/images/34188/standard/jup.png",
  OP: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/op.png",
  ARB: "https://assets.coingecko.com/coins/images/16547/standard/photo_2023-03-29_21.47.00.jpeg",
  ADA: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/ada.png",
  LINK: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/link.png",
};

const matches = [
  { id: 1, classType: "Major", board: "Live", duration: "1h", league: "Crypto Majors", title: "BTC vs ETH", subtitle: "Who outperforms over the next hour?", left: { ticker: "BTC", odds: 1.76, change: "+0.84%" }, draw: { odds: 3.4, change: "Tie move" }, right: { ticker: "ETH", odds: 1.94, change: "+0.62%" }, pool: "$64,800", entries: 412, timer: "43m left" },
  { id: 2, classType: "Major", board: "Live", duration: "4h", league: "Crypto Majors", title: "SOL vs AVAX", subtitle: "Which coin wins this momentum round?", left: { ticker: "SOL", odds: 1.68, change: "+1.24%" }, draw: { odds: 4.1, change: "Tie move" }, right: { ticker: "AVAX", odds: 2.05, change: "+0.73%" }, pool: "$52,300", entries: 295, timer: "3h 08m left" },
  { id: 3, classType: "Altcoins", board: "Live", duration: "15m", league: "Altcoin Arena", title: "TIA vs INJ", subtitle: "Fast round. Pick the stronger mover.", left: { ticker: "TIA", odds: 1.88, change: "+0.33%" }, draw: { odds: 3.8, change: "Tie move" }, right: { ticker: "INJ", odds: 1.83, change: "+0.41%" }, pool: "$19,900", entries: 188, timer: "09m left" },
  { id: 4, classType: "Meme", board: "Live", duration: "30m", league: "Meme Arena", title: "DOGE vs PEPE", subtitle: "Meme battle live now.", left: { ticker: "DOGE", odds: 1.91, change: "+2.13%" }, draw: { odds: 4.45, change: "Tie move" }, right: { ticker: "PEPE", odds: 1.85, change: "+1.98%" }, pool: "$27,100", entries: 210, timer: "18m left" },
  { id: 5, classType: "Major", board: "Upcoming", duration: "1D", league: "Crypto Majors", title: "XRP vs BNB", subtitle: "Daily battle opens shortly.", left: { ticker: "XRP", odds: 2.08, change: "Starts soon" }, draw: { odds: 5.0, change: "Tie move" }, right: { ticker: "BNB", odds: 1.66, change: "Starts soon" }, pool: "$48,120", entries: 337, timer: "Starts in 22m" },
  { id: 6, classType: "Altcoins", board: "Upcoming", duration: "1h", league: "Solana Board", title: "SOL vs JUP", subtitle: "Upcoming Solana ecosystem clash.", left: { ticker: "SOL", odds: 1.78, change: "Starts soon" }, draw: { odds: 4.2, change: "Tie move" }, right: { ticker: "JUP", odds: 1.96, change: "Starts soon" }, pool: "$21,400", entries: 140, timer: "Starts in 11m" },
  { id: 7, classType: "Major", board: "Live", duration: "1D", league: "Crypto Majors", title: "BTC vs SOL", subtitle: "Big-cap battle for the day.", left: { ticker: "BTC", odds: 1.72, change: "+1.10%" }, draw: { odds: 4.7, change: "Tie move" }, right: { ticker: "SOL", odds: 2.02, change: "+1.66%" }, pool: "$73,500", entries: 460, timer: "19h left" },
  { id: 8, classType: "Meme", board: "Upcoming", duration: "5m", league: "Meme Arena", title: "PEPE vs DOGE", subtitle: "Quick-fire meme round.", left: { ticker: "PEPE", odds: 1.93, change: "Starts soon" }, draw: { odds: 4.8, change: "Tie move" }, right: { ticker: "DOGE", odds: 1.84, change: "Starts soon" }, pool: "$8,640", entries: 84, timer: "Starts in 4m" },
  { id: 9, classType: "Major", board: "Live", duration: "30m", league: "L2 Matchups", title: "OP vs ARB", subtitle: "Layer-2 speed battle.", left: { ticker: "OP", odds: 1.95, change: "+0.57%" }, draw: { odds: 4.0, change: "Tie move" }, right: { ticker: "ARB", odds: 1.82, change: "+0.76%" }, pool: "$17,220", entries: 126, timer: "21m left" },
  { id: 10, classType: "Altcoins", board: "Live", duration: "4h", league: "Altcoin Arena", title: "LINK vs ADA", subtitle: "Utility versus community strength.", left: { ticker: "LINK", odds: 1.86, change: "+0.48%" }, draw: { odds: 4.3, change: "Tie move" }, right: { ticker: "ADA", odds: 1.89, change: "+0.43%" }, pool: "$15,910", entries: 118, timer: "2h 44m left" },
  { id: 11, classType: "Major", board: "Upcoming", duration: "15m", league: "Crypto Majors", title: "ETH vs SOL", subtitle: "Fast majors matchup opening soon.", left: { ticker: "ETH", odds: 1.81, change: "Starts soon" }, draw: { odds: 4.1, change: "Tie move" }, right: { ticker: "SOL", odds: 1.91, change: "Starts soon" }, pool: "$22,440", entries: 149, timer: "Starts in 8m" },
  { id: 12, classType: "Altcoins", board: "Live", duration: "5m", league: "Solana Board", title: "JUP vs TIA", subtitle: "Quick battle for short-term momentum.", left: { ticker: "JUP", odds: 1.87, change: "+0.21%" }, draw: { odds: 4.5, change: "Tie move" }, right: { ticker: "TIA", odds: 1.87, change: "+0.20%" }, pool: "$6,820", entries: 71, timer: "03m left" },
];

const activeBets = [
  { user: "WhaleMode", size: "$12,500", picks: 4 },
  { user: "CoinSniper", size: "$8,200", picks: 3 },
  { user: "ChartWizard", size: "$5,750", picks: 5 },
  { user: "AltKing", size: "$3,900", picks: 2 },
];

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatOdds(value) {
  return `${value.toFixed(2)}x`;
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

function TokenMark({ ticker }) {
  const src = coinIcons[ticker];

  if (!src) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border bg-white/5 text-[10px] font-semibold text-white" style={{ borderColor: COLORS.line }}>
        {ticker.slice(0, 1)}
      </div>
    );
  }

  return <img src={src} alt={ticker} className="h-6 w-6 rounded-full object-cover" />;
}

function LoadingOverlay({ loading }) {
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

function AuthModal({ open, mode, setMode, onClose }) {
  const [emailMode, setEmailMode] = useState(false);

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
                <h3 className="mt-1 text-xl font-semibold text-white">{mode === "signup" ? "Create your account" : "Welcome back"}</h3>
              </div>
              <button onClick={onClose} className="rounded-full border p-2 text-slate-400 transition hover:text-white" style={{ borderColor: COLORS.line }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pt-5">
              <div className="grid grid-cols-2 rounded-2xl border bg-white/5 p-1" style={{ borderColor: COLORS.line }}>
                <button
                  onClick={() => {
                    setMode("signup");
                    setEmailMode(false);
                  }}
                  className={cx("rounded-xl px-4 py-2 text-sm font-medium", mode === "signup" ? "text-black" : "text-slate-300")}
                  style={mode === "signup" ? { background: COLORS.accent } : {}}
                >
                  Sign Up
                </button>
                <button
                  onClick={() => {
                    setMode("login");
                    setEmailMode(false);
                  }}
                  className={cx("rounded-xl px-4 py-2 text-sm font-medium", mode === "login" ? "text-black" : "text-slate-300")}
                  style={mode === "login" ? { background: COLORS.accent } : {}}
                >
                  Login
                </button>
              </div>
            </div>

            <div className="space-y-3 px-6 py-5">
              {!emailMode ? (
                <>
                  <MethodButton icon={<Wallet className="h-4 w-4" />} label={`${mode === "signup" ? "Continue" : "Login"} with Wallet`} />
                  <MethodButton icon={<Mail className="h-4 w-4" />} label={`${mode === "signup" ? "Continue" : "Login"} with Email`} onClick={() => setEmailMode(true)} />
                  <MethodButton label={`${mode === "signup" ? "Continue" : "Login"} with Google`} badge="G" />
                  <MethodButton label={`${mode === "signup" ? "Continue" : "Login"} with Apple`} badge="" />
                </>
              ) : (
                <div className="space-y-3 rounded-2xl border bg-white/5 p-4" style={{ borderColor: COLORS.line }}>
                  {mode === "signup" && <input className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" style={{ borderColor: COLORS.line }} placeholder="Username" />}
                  <input className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" style={{ borderColor: COLORS.line }} placeholder="Email address" />
                  <input type="password" className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" style={{ borderColor: COLORS.line }} placeholder="Password" />
                  <button className="w-full rounded-2xl px-4 py-3 text-sm font-semibold text-black" style={{ background: COLORS.accent }}>
                    {mode === "signup" ? "Create PREDA account" : "Login to PREDA"}
                  </button>
                  <button onClick={() => setEmailMode(false)} className="w-full text-sm text-slate-400 transition hover:text-white">
                    Back to all methods
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MethodButton({ icon, label, badge, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-2xl border bg-white/5 px-4 py-3 text-left transition hover:bg-white/[0.07]" style={{ borderColor: COLORS.line }}>
      <div className="flex items-center gap-3 text-sm font-medium text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border bg-black/20 text-slate-200" style={{ borderColor: COLORS.line }}>
          {icon || badge}
        </span>
        {label}
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-5 right-5 z-[60] w-full max-w-sm rounded-[24px] border bg-[#0b110b]/95 p-4 shadow-2xl backdrop-blur"
          style={{ borderColor: COLORS.lineStrong }}
        >
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
                <button className="mt-3 inline-flex items-center gap-2 text-sm" style={{ color: COLORS.accent }}>
                  View update <ArrowRight className="h-4 w-4" />
                </button>
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

function SidebarButton({ expanded, item }) {
  const Icon = item.icon;

  return (
    <motion.a
      href={item.href}
      whileHover={{ x: expanded ? 4 : 0, scale: 1.01 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-3 rounded-2xl border px-3 py-3 transition hover:bg-white/[0.04]"
      style={{ borderColor: COLORS.line }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-white/[0.03]" style={{ borderColor: COLORS.line, color: COLORS.accent }}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      {expanded && (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="truncate text-sm text-white">{item.label}</span>
          {item.badge ? (
            <span className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em]" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
              {item.badge}
            </span>
          ) : null}
        </div>
      )}
    </motion.a>
  );
}

function DesktopHeader({ expanded, onToggleSidebar, onLogin, onSignup }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 hidden h-[72px] border-b bg-[#060906]/92 backdrop-blur-xl lg:block" style={{ borderColor: COLORS.lineStrong }}>
      <div className="flex h-full items-center justify-between">
        <button
          onClick={onToggleSidebar}
          className={cx("flex h-full items-center gap-3 border-r px-4 text-left transition-all duration-300", expanded ? "w-[280px]" : "w-[86px]")}
          style={{ borderColor: COLORS.lineStrong }}
        >
          <motion.div whileHover={{ rotate: -6, scale: 1.04 }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border text-sm font-bold" style={{ borderColor: COLORS.lineStrong, background: COLORS.accentSoft, color: COLORS.accent }}>
            P
          </motion.div>
          {expanded && <span className="text-lg font-semibold text-white">PREDA</span>}
        </button>

        <div className="flex items-center gap-3 px-5">
          <button onClick={onLogin} className="rounded-2xl border px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.04]" style={{ borderColor: COLORS.line }}>
            Login
          </button>
          <button onClick={onSignup} className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90" style={{ background: COLORS.accent }}>
            Sign Up
          </button>
        </div>
      </div>
    </header>
  );
}

function DesktopSidebar({ expanded }) {
  return (
    <aside className={cx("fixed bottom-0 left-0 top-[72px] z-40 hidden border-r bg-[#070b07] transition-all duration-300 lg:block", expanded ? "w-[280px]" : "w-[86px]")} style={{ borderColor: COLORS.lineStrong }}>
      <div className="preda-scrollbar-hide flex h-full flex-col justify-between overflow-y-auto px-3 py-4">
        <div className="space-y-3">
          {sidebarItems.map((item) => (
            <SidebarButton key={item.label} expanded={expanded} item={item} />
          ))}
        </div>

        <div className="space-y-3 border-t pt-4" style={{ borderColor: COLORS.line }}>
          {supportItems.map((item) => (
            <SidebarButton key={item.label} expanded={expanded} item={item} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function MobileShell({ open, setOpen, onLogin, onSignup }) {
  return (
    <>
      <div className="sticky top-0 z-50 flex h-[68px] items-center justify-between border-b bg-[#060906]/92 px-4 backdrop-blur-xl lg:hidden" style={{ borderColor: COLORS.lineStrong }}>
        <button onClick={() => setOpen(true)} className="rounded-xl border p-2 text-white" style={{ borderColor: COLORS.line }}>
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border text-sm font-bold" style={{ borderColor: COLORS.lineStrong, background: COLORS.accentSoft, color: COLORS.accent }}>
            P
          </div>
          <span className="text-base font-semibold text-white">PREDA</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onLogin} className="rounded-xl border px-3 py-2 text-xs font-medium text-white" style={{ borderColor: COLORS.line }}>
            Login
          </button>
          <button onClick={onSignup} className="rounded-xl px-3 py-2 text-xs font-semibold text-black" style={{ background: COLORS.accent }}>
            Sign Up
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/70 lg:hidden">
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} className="h-full w-[300px] border-r bg-[#070b07]" style={{ borderColor: COLORS.lineStrong }}>
              <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: COLORS.line }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border text-sm font-bold" style={{ borderColor: COLORS.lineStrong, background: COLORS.accentSoft, color: COLORS.accent }}>
                    P
                  </div>
                  <span className="text-base font-semibold text-white">PREDA</span>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-xl border p-2 text-white" style={{ borderColor: COLORS.line }}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="preda-scrollbar-hide flex h-[calc(100%-73px)] flex-col justify-between overflow-y-auto px-3 py-4">
                <div className="space-y-3">
                  {sidebarItems.map((item) => (
                    <SidebarButton key={item.label} expanded={true} item={item} />
                  ))}
                </div>
                <div className="space-y-3 border-t pt-4" style={{ borderColor: COLORS.line }}>
                  {supportItems.map((item) => (
                    <SidebarButton key={item.label} expanded={true} item={item} />
                  ))}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Showboard() {
  const [current, setCurrent] = useState(0);
  const slide = showSlides[current];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % showSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const prev = () => setCurrent((current - 1 + showSlides.length) % showSlides.length);
  const next = () => setCurrent((current + 1) % showSlides.length);

  return (
    <section className="px-4 pt-6 sm:px-6 xl:px-8">
      <div className="relative overflow-hidden rounded-[28px] border bg-[linear-gradient(135deg,rgba(11,33,11,0.96),rgba(5,12,5,0.98))] px-6 py-7 sm:px-8" style={{ borderColor: COLORS.lineStrong }}>
        <div className="absolute inset-y-0 left-0 w-32 bg-[radial-gradient(circle_at_left,rgba(141,255,79,0.12),transparent_62%)]" />
        <div className="absolute inset-y-0 right-0 w-32 bg-[radial-gradient(circle_at_right,rgba(141,255,79,0.10),transparent_62%)]" />

        <div className="relative flex items-center justify-between gap-6">
          <button onClick={prev} className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border sm:flex" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.28 }}
              >
                <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: COLORS.accent }}>
                  {slide.title}
                </p>
                <p className="mt-3 max-w-4xl text-lg font-semibold text-white sm:text-2xl">{slide.text}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <a href="#arena" className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-black" style={{ background: COLORS.accent }}>
                    {slide.cta}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
                    Built by humans and AI
                  </span>
                  <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
                    Coming to Solana
                  </span>
                  <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS.line, color: COLORS.accent }}>
                    AUTO
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <button onClick={next} className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border sm:flex" style={{ borderColor: COLORS.line, color: COLORS.textSoft }}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function Filters({ selectedBoard, setSelectedBoard, selectedClass, setSelectedClass, selectedDuration, setSelectedDuration }) {
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
          {classTabs.map((tab) => (
            <button key={tab} onClick={() => setSelectedClass(tab)} className={cx("rounded-full px-3 py-2 text-sm font-medium", selectedClass === tab ? "text-black" : "text-white")} style={selectedClass === tab ? { background: COLORS.accent } : { border: `1px solid ${COLORS.line}`, background: "rgba(255,255,255,0.03)" }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs uppercase tracking-[0.22em]" style={{ color: COLORS.textSoft }}>
          Match Duration
        </p>
        <div className="flex flex-wrap gap-2">
          {matchDurations.map((tab) => (
            <button key={tab} onClick={() => setSelectedDuration(tab)} className={cx("rounded-full px-3 py-2 text-sm font-medium", selectedDuration === tab ? "text-black" : "text-white")} style={selectedDuration === tab ? { background: COLORS.accent } : { border: `1px solid ${COLORS.line}`, background: "rgba(255,255,255,0.03)" }}>
              {tab}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectionButton({ active, label, odds, meta, ticker }) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.16 }}
      className={cx("rounded-[20px] border px-3 py-3 text-left transition", active ? "ring-1" : "")}
      style={{ borderColor: active ? COLORS.lineStrong : COLORS.line, background: active ? COLORS.accentSoft : "rgba(255,255,255,0.03)", boxShadow: active ? `0 0 0 1px ${COLORS.accentGlow} inset` : "none" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
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

function MarketCard({ match, selectedSide, onPick }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }} transition={{ duration: 0.18 }} layout className="rounded-[24px] border bg-[#0b110b] p-5" style={{ borderColor: COLORS.lineStrong }}>
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
            <StatBox label="Pool" value={match.pool} />
            <StatBox label="Entries" value={match.entries} />
            <StatBox label="Timer" value={match.timer} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button onClick={() => onPick(match.id, "left")}>
            <SelectionButton active={selectedSide === "left"} label={match.left.ticker} odds={match.left.odds} meta={match.left.change} ticker={match.left.ticker} />
          </button>
          <button onClick={() => onPick(match.id, "draw")}>
            <SelectionButton active={selectedSide === "draw"} label="Draw" odds={match.draw.odds} meta={match.draw.change} ticker="DRAW" />
          </button>
          <button onClick={() => onPick(match.id, "right")}>
            <SelectionButton active={selectedSide === "right"} label={match.right.ticker} odds={match.right.odds} meta={match.right.change} ticker={match.right.ticker} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="rounded-2xl border bg-black/20 px-3 py-3" style={{ borderColor: COLORS.line }}>
      <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textSoft }}>
        {label}
      </p>
      <p className="mt-2 font-medium text-white">{value}</p>
    </div>
  );
}

function SlipHandle({ open, setOpen, count }) {
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

function SlipTabs({ count }) {
  const active = count <= 1 ? "Single" : "Combo";

  return (
    <div className="grid grid-cols-3 text-sm">
      {["Single", "Combo", "System"].map((tab) => {
        const disabled = tab === "System";
        return (
          <div key={tab} className="border-b px-3 py-3 text-center font-medium" style={{ borderColor: active === tab ? COLORS.accent : COLORS.line, color: disabled ? "#4e5e49" : active === tab ? COLORS.accent : COLORS.textSoft }}>
            {tab}
          </div>
        );
      })}
    </div>
  );
}

function SlipRow({ item, onRemove }) {
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }} className="flex gap-3 border-b bg-white/[0.02] px-3 py-4" style={{ borderColor: COLORS.line }}>
      <button onClick={() => onRemove(item.id)} className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-slate-400" style={{ borderColor: COLORS.line }}>
        <X className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white">{item.pickLabel}</p>
        <p className="mt-1 text-sm" style={{ color: COLORS.textSoft }}>
          {item.title}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em]" style={{ color: COLORS.textSoft }}>
          3-Way · {item.duration}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg font-semibold" style={{ color: COLORS.accent }}>
          {formatOdds(item.odds)}
        </p>
      </div>
    </motion.div>
  );
}

function SlipDrawer({ open, count, items, stake, setStake, onRemove }) {
  const combinedOdds = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((acc, item) => acc * item.odds, 1);
  }, [items]);

  const projected = useMemo(() => {
    const size = Number(stake || 0);
    if (!size || !combinedOdds) return 0;
    return size * combinedOdds;
  }, [stake, combinedOdds]);

  return (
    <motion.aside
      animate={{ x: open ? 0 : 420, opacity: open ? 1 : 0.96 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="fixed bottom-5 right-5 top-[92px] z-[45] hidden w-[380px] overflow-hidden rounded-[30px] border bg-[#0b110b] shadow-2xl lg:block"
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
              <p className="text-xs text-black/70">{count} selections</p>
            </div>
          </div>
          <div className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/80">AUTO</div>
        </div>

        <SlipTabs count={count} />

        <div className="preda-scrollbar-hide min-h-0 flex-1 overflow-y-auto">
          {items.length ? (
            items.map((item) => <SlipRow key={item.id} item={item} onRemove={onRemove} />)
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
                <span className="font-medium text-white">{items.length ? formatOdds(combinedOdds) : "--"}</span>
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
   
              <button
                disabled={loading || !items.length}
                onClick={handlePlaceTicket}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: COLORS.accent }}
              >
                <Lock className="h-4 w-4" />
                {loading ? "Processing..." : "Place Ticket"}
             </button>
          </div>

          <div id="leaderboard" className="border-t px-4 py-4" style={{ borderColor: COLORS.line }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-white">Active Bets</p>
                <p className="mt-1 text-sm" style={{ color: COLORS.textSoft }}>
                  Biggest live sizes first.
                </p>
              </div>
              <div className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS.line, color: COLORS.accent }}>
                Live
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {activeBets.map((bet, index) => (
                <motion.div key={bet.user} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: index * 0.04 }} className="flex items-center justify-between rounded-[20px] border bg-black/20 p-4" style={{ borderColor: COLORS.line }}>
                  <div>
                    <p className="font-medium text-white">#{index + 1} {bet.user}</p>
                    <p className="mt-1 text-sm" style={{ color: COLORS.textSoft }}>
                      {bet.picks} picks
                    </p>
                  </div>
                  <p className="font-semibold" style={{ color: COLORS.accent }}>
                    {bet.size}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t bg-black/20" style={{ borderColor: COLORS.line }}>
      <div className="mx-auto grid max-w-[1700px] gap-8 px-4 py-10 sm:px-6 xl:grid-cols-[1fr_auto] xl:px-8">
        <div>
          <p className="text-2xl font-semibold text-white">PREDA</p>
          <p className="mt-3 max-w-lg text-sm leading-7" style={{ color: COLORS.textSoft }}>
            <span className="font-medium text-white">First crypto competition market.</span> Battle coins, build parlays, and set records.
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

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-white">Links</p>
            <div className="mt-3 space-y-2 text-sm" style={{ color: COLORS.textSoft }}>
              <a href="#arena" className="block transition hover:text-white">Arena</a>
              <a href="#news-anchor" className="block transition hover:text-white">Market News</a>
              <a id="waitlist-link" href="#waitlist-link" className="block transition hover:text-white">Waitlist Page</a>
              <a href="#leaderboard" className="block transition hover:text-white">Leader Board</a>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Support</p>
            <div className="mt-3 space-y-2 text-sm" style={{ color: COLORS.textSoft }}>
              <a id="how-to-play" href="#how-to-play" className="block transition hover:text-white">How to Play</a>
              <a id="help" href="#help" className="block transition hover:text-white">Help</a>
              <a id="contact" href="#contact" className="block transition hover:text-white">Contact Us</a>
            </div>
          </div>
        </div>
      </div>
      <div id="news-anchor" className="hidden" />
    </footer>
  );
}

export default function PredaLandingDashboardMockup() {
  const [loading, SsetLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState("Live");
  const [selectedClass, setSelectedClass] = useState("All");
  const [selectedDuration, setSelectedDuration] = useState("All");
  const [stake, setStake] = useState("100");
  const [selections, setSelections] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const visibleMatches = useMemo(() => {
    return matches.filter((match) => {
      const boardMatch = match.board === selectedBoard;
      const classMatch = selectedClass === "All" || match.classType === selectedClass;
      const durationMatch = selectedDuration === "All" || match.duration === selectedDuration;
      return boardMatch && classMatch && durationMatch;
    });
  }, [selectedBoard, selectedClass, selectedDuration]);

  const ticketItems = useMemo(() => {
    return Object.entries(selections)
      .map(([id, side]) => {
        const match = matches.find((item) => item.id === Number(id));
        if (!match) return null;
        if (side === "left") return { id: match.id, title: match.title, duration: match.duration, odds: match.left.odds, pickLabel: match.left.ticker };
        if (side === "right") return { id: match.id, title: match.title, duration: match.duration, odds: match.right.odds, pickLabel: match.right.ticker };
        return { id: match.id, title: match.title, duration: match.duration, odds: match.draw.odds, pickLabel: "Draw" };
      })
      .filter(Boolean);
  }, [selections]);

  useEffect(() => {
    if (ticketItems.length > 0) {
      setSlipOpen(true);
    }
  }, [ticketItems.length]);

  const handlePick = (matchId, side) => {
    setSelections((prev) => {
      const active = prev[matchId] === side;
      if (active) {
        const next = { ...prev };
        delete next[matchId];
        return next;
      }
      return { ...prev, [matchId]: side };
    });
  };

  const handleRemove = (matchId) => {
    setSelections((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
  };

 const handlePlaceTicket = async () => {
   try {
    setLoading(true);

    await connectWallet();

    const picks = JSON.stringify(ticketItems);

    const result = await placeTicketOnChain({
      picks,
      stake: Number(stake),
      combinedOdds: Math.floor(combinedOdds * 100),
    });

    alert("✅ Ticket placed successfully!");
    console.log("TX:", result);

  } catch (err) {
    console.error(err);
    alert(err.message || "❌ Transaction failed");
  } finally {
    setLoading(false);
  }
}; 

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <PredaStyles />
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(circle at top right, rgba(141,255,79,0.07), transparent 24%), radial-gradient(circle at top left, rgba(141,255,79,0.05), transparent 18%)" }} />

      <LoadingOverlay loading={loading} />
      <AuthModal open={authOpen} mode={authMode} setMode={setAuthMode} onClose={() => setAuthOpen(false)} />
      <BreakingNewsPopup />

      <DesktopHeader expanded={sidebarExpanded} onToggleSidebar={() => setSidebarExpanded(!sidebarExpanded)} onLogin={() => { setAuthMode("login"); setAuthOpen(true); }} onSignup={() => { setAuthMode("signup"); setAuthOpen(true); }} />
      <DesktopSidebar expanded={sidebarExpanded} />
      <MobileShell open={mobileSidebarOpen} setOpen={setMobileSidebarOpen} onLogin={() => { setAuthMode("login"); setAuthOpen(true); }} onSignup={() => { setAuthMode("signup"); setAuthOpen(true); }} />

      <SlipHandle open={slipOpen} setOpen={setSlipOpen} count={ticketItems.length} />
      <SlipDrawer open={slipOpen} count={ticketItems.length} items={ticketItems} stake={stake} setStake={setStake} onRemove={handleRemove} />

      <div className={cx("transition-all duration-300", sidebarExpanded ? "lg:pl-[280px]" : "lg:pl-[86px]", "pt-[68px] lg:pt-[72px]")}>
        <Showboard />

        <main id="arena" className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 xl:px-8">
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

            <Filters selectedBoard={selectedBoard} setSelectedBoard={setSelectedBoard} selectedClass={selectedClass} setSelectedClass={setSelectedClass} selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration} />

            <div className="grid gap-4 px-5 py-6 sm:px-6 xl:grid-cols-2">
              {visibleMatches.length ? (
                visibleMatches.map((match) => <MarketCard key={match.id} match={match} selectedSide={selections[match.id]} onPick={handlePick} />)
              ) : (
                <div className="rounded-[24px] border border-dashed p-8 text-center xl:col-span-2" style={{ borderColor: COLORS.line }}>
                  <p className="text-lg font-medium text-white">No markets in this filter right now.</p>
                  <p className="mt-2 text-sm" style={{ color: COLORS.textSoft }}>
                    Switch class, board type, or match duration.
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}
