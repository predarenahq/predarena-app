import React, { useMemo, useState } from 'react';

type MarketCard = {
  id: number;
  title: string;
  category: string;
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  leftPercent: number;
  rightPercent: number;
  leftOdds: string;
  drawOdds: string;
  rightOdds: string;
  volume: string;
  endTime: string;
  tag: string;
};

type SlipPick = {
  marketId: number;
  label: string;
  odds: string;
};

const menuItems = [
  { label: 'Markets', active: true },
  { label: '5-Minute Markets' },
  { label: 'Leaderboard' },
  { label: 'News' },
];

const topics = [
  { label: 'Crypto', note: '26 Markets', active: true },
  { label: 'Sports', note: 'Coming Soon' },
  { label: 'Politics', note: '12 Markets' },
  { label: 'Economy', note: '15 Markets' },
  { label: 'Gaming', note: '4 Markets' },
  { label: 'Culture', note: '3 Markets' },
];

const tabs = ['All', 'Crypto', 'Sports', 'Politics', 'Economy', 'Gaming', 'Culture'];

const markets: MarketCard[] = [
  {
    id: 1,
    title: 'BTC vs ETH: Which outperforms in the next 5 minutes?',
    category: 'Crypto',
    left: 'BTC',
    right: 'ETH',
    leftLabel: 'BTC',
    rightLabel: 'ETH',
    leftPercent: 58,
    rightPercent: 42,
    leftOdds: '1.5x',
    drawOdds: '3.0x',
    rightOdds: '2.3x',
    volume: '$18.2K',
    endTime: '5 MIN',
    tag: 'Live',
  },
  {
    id: 2,
    title: 'SOL vs AVAX: Who wins the next 15-minute battle?',
    category: 'Crypto',
    left: 'SOL',
    right: 'AVAX',
    leftLabel: 'SOL',
    rightLabel: 'AVAX',
    leftPercent: 52,
    rightPercent: 48,
    leftOdds: '1.8x',
    drawOdds: '3.0x',
    rightOdds: '1.9x',
    volume: '$9.4K',
    endTime: '15 MIN',
    tag: 'Hot',
  },
  {
    id: 3,
    title: 'BNB vs HYPE: Which asset closes stronger this hour?',
    category: 'Crypto',
    left: 'BNB',
    right: 'HYPE',
    leftLabel: 'BNB',
    rightLabel: 'HYPE',
    leftPercent: 44,
    rightPercent: 56,
    leftOdds: '2.1x',
    drawOdds: '3.2x',
    rightOdds: '1.7x',
    volume: '$12.7K',
    endTime: '1 HOUR',
    tag: 'Trending',
  },
  {
    id: 4,
    title: 'LINK vs ARB: Which one puts up the better daily performance?',
    category: 'Crypto',
    left: 'LINK',
    right: 'ARB',
    leftLabel: 'LINK',
    rightLabel: 'ARB',
    leftPercent: 47,
    rightPercent: 53,
    leftOdds: '2.0x',
    drawOdds: '3.1x',
    rightOdds: '1.8x',
    volume: '$7.1K',
    endTime: '1 DAY',
    tag: 'New',
  },
];

function App() {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [slip, setSlip] = useState<SlipPick[]>([]);

  const filteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      const matchesTab = activeTab === 'All' || market.category === activeTab;
      const matchesSearch =
        market.title.toLowerCase().includes(search.toLowerCase()) ||
        market.left.toLowerCase().includes(search.toLowerCase()) ||
        market.right.toLowerCase().includes(search.toLowerCase());

      if (activeTab === 'Sports') return false;
      return matchesTab && matchesSearch;
    });
  }, [activeTab, search]);

  const addToSlip = (market: MarketCard, side: 'left' | 'draw' | 'right') => {
    let label = '';
    let odds = '';

    if (side === 'left') {
      label = `${market.left} beats ${market.right}`;
      odds = market.leftOdds;
    } else if (side === 'draw') {
      label = `${market.left} vs ${market.right} ends in draw`;
      odds = market.drawOdds;
    } else {
      label = `${market.right} beats ${market.left}`;
      odds = market.rightOdds;
    }

    setSlip((prev) => {
      const others = prev.filter((item) => item.marketId !== market.id);
      return [...others, { marketId: market.id, label, odds }];
    });
  };

  const removePick = (marketId: number) => {
    setSlip((prev) => prev.filter((item) => item.marketId !== marketId));
  };

  const combinedOdds = useMemo(() => {
    if (slip.length === 0) return '0.00x';
    const product = slip.reduce((acc, item) => acc * Number(item.odds.replace('x', '')), 1);
    return `${product.toFixed(2)}x`;
  }, [slip]);

  return (
    <div className="min-h-screen bg-[#040806] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-[290px] shrink-0 border-r border-white/5 bg-[#04070a] xl:flex xl:flex-col">
          <div className="border-b border-white/5 px-6 py-7">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 font-black text-black shadow-lg shadow-green-500/20">
                PA
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">predarena</h1>
                <p className="text-sm text-zinc-400">Competition market board</p>
              </div>
            </div>
          </div>

          <div className="px-4 py-5">
            <div className="space-y-2">
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  className={`flex w-full items-center rounded-2xl px-4 py-4 text-left text-base font-semibold transition ${
                    item.active
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 px-6">
            <div className="h-px bg-white/10" />
          </div>

          <div className="px-6 py-5">
            <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-zinc-500">TOPICS</p>
            <div className="space-y-3">
              {topics.map((topic) => (
                <button
                  key={topic.label}
                  className={`flex w-full items-start justify-between rounded-2xl px-3 py-3 text-left transition ${
                    topic.active ? 'bg-[#0b1310] ring-1 ring-green-400/20' : 'hover:bg-white/5'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-white">{topic.label}</div>
                    <div className="text-sm text-zinc-500">{topic.note}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto px-6 py-6 text-sm text-zinc-500">
            <div className="mb-2">Help & Feedback</div>
            <div>Terms of Use • Privacy Policy</div>
          </div>
        </aside>

        <main className="flex-1">
          <div className="border-b border-white/5 bg-gradient-to-r from-[#05160b] via-[#0b2d18] to-[#040806] px-5 py-4 md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 xl:hidden">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 font-black text-black">
                  PA
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight">predarena</h1>
                  <p className="text-xs text-zinc-400">Competition market</p>
                </div>
              </div>

              <div className="hidden xl:block">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-green-300/80">
                  First crypto competition market
                </h2>
              </div>

              <button className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:opacity-90">
                Connect Wallet
              </button>
            </div>
          </div>

          <div className="px-5 py-6 md:px-8">
            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
              <div>
                <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#090d12] shadow-2xl shadow-black/30">
                  <div className="relative overflow-hidden px-6 py-8 md:px-8 md:py-10">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_45%,rgba(168,85,247,0.35),transparent_22%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.22),transparent_22%),linear-gradient(180deg,#04070a_0%,#070d12_100%)]" />
                    <div className="relative z-10 max-w-xl">
                      <span className="mb-3 inline-flex rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-green-300">
                        PredArena Beta Board
                      </span>
                      <h3 className="text-3xl font-black leading-tight tracking-tight md:text-5xl">
                        Battle coins. Build parlays. Set records.
                      </h3>
                      <p className="mt-4 max-w-lg text-sm leading-7 text-zinc-300 md:text-base">
                        A competition market interface built for crypto-native rivalry now, with
                        sports markets coming soon.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <button className="rounded-2xl bg-white px-5 py-3 font-semibold text-black">
                          Trade Now
                        </button>
                        <button className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white">
                          View Waitlist
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-5 border-b border-white/10 pb-3">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`relative pb-3 text-base font-medium transition ${
                        activeTab === tab ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'
                      }`}
                    >
                      {tab}
                      {activeTab === tab && (
                        <span className="absolute bottom-0 left-0 h-[3px] w-full rounded-full bg-blue-500" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-4 md:flex-row">
                  <div className="flex-1 rounded-2xl border border-white/10 bg-[#080b10] px-5 py-4 text-zinc-400">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search markets"
                      className="w-full bg-transparent text-white outline-none placeholder:text-zinc-500"
                    />
                  </div>
                  <button className="rounded-2xl border border-white/10 bg-[#080b10] px-6 py-4 font-semibold text-white">
                    Filters
                  </button>
                </div>

                {activeTab === 'Sports' && (
                  <div className="mt-6 rounded-[28px] border border-dashed border-green-400/20 bg-[#07110c] px-6 py-10 text-center">
                    <h4 className="text-2xl font-bold">Sports markets are coming soon</h4>
                    <p className="mt-3 text-zinc-400">
                      PredArena will expand beyond crypto into sports competition markets.
                    </p>
                  </div>
                )}

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {filteredMarkets.map((market) => (
                    <div
                      key={market.id}
                      className="overflow-hidden rounded-[28px] border border-white/10 bg-[#111624] shadow-xl shadow-black/20"
                    >
                      <div className="h-44 bg-[linear-gradient(135deg,#0e2b2a_0%,#14263e_40%,#21162f_100%)]" />

                      <div className="px-5 pb-5 pt-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                            {market.tag}
                          </span>
                          <span className="text-xs text-zinc-500">{market.endTime}</span>
                        </div>

                        <h4 className="text-2xl font-bold leading-tight tracking-tight text-white">
                          {market.title}
                        </h4>

                        <div className="mt-5 flex items-center justify-between text-sm font-semibold text-zinc-300">
                          <span>{market.leftPercent}%</span>
                          <span>{market.rightPercent}%</span>
                        </div>

                        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-[linear-gradient(90deg,#35d6c1_0%,#c7ef8a_55%,#eb57b5_100%)]"
                            style={{ width: `${market.leftPercent}%` }}
                          />
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-3">
                          <button
                            onClick={() => addToSlip(market, 'left')}
                            className="rounded-2xl bg-[#114b49] px-3 py-4 text-center text-white transition hover:opacity-90"
                          >
                            <div className="text-sm font-semibold">{market.leftLabel}</div>
                            <div className="mt-1 text-2xl font-black">{market.leftOdds}</div>
                          </button>

                          <button
                            onClick={() => addToSlip(market, 'draw')}
                            className="rounded-2xl bg-[#4b5565] px-3 py-4 text-center text-white transition hover:opacity-90"
                          >
                            <div className="text-sm font-semibold">DRAW</div>
                            <div className="mt-1 text-2xl font-black">{market.drawOdds}</div>
                          </button>

                          <button
                            onClick={() => addToSlip(market, 'right')}
                            className="rounded-2xl bg-[#5a2f5f] px-3 py-4 text-center text-white transition hover:opacity-90"
                          >
                            <div className="text-sm font-semibold">{market.rightLabel}</div>
                            <div className="mt-1 text-2xl font-black">{market.rightOdds}</div>
                          </button>
                        </div>

                        <div className="mt-5 flex items-center justify-between text-sm text-zinc-500">
                          <span>{market.volume}</span>
                          <span>{market.category}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="xl:sticky xl:top-24 xl:self-start">
                <div className="rounded-[28px] border border-green-400/30 bg-[#0e1b23] p-5 shadow-xl shadow-black/20">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-black">Your Parlay</h3>
                    <button
                      onClick={() => setSlip([])}
                      className="text-sm font-medium text-zinc-400 hover:text-white"
                    >
                      Clear
                    </button>
                  </div>

                  {slip.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-zinc-400">
                      <p className="font-medium text-zinc-200">No picks yet.</p>
                      <p className="mt-2 text-sm">
                        Add 2–3 battles to start building your competition ticket.
                      </p>
                      <button className="mt-5 w-full rounded-2xl bg-white/10 px-4 py-4 font-semibold text-zinc-200">
                        Add 2+ picks
                      </button>
                      <p className="mt-4 text-center text-xs text-zinc-500">
                        Mock demo • Wallet connection simulated
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 space-y-3">
                        {slip.map((pick) => (
                          <div
                            key={pick.marketId}
                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-white">{pick.label}</p>
                                <p className="mt-1 text-xs text-zinc-500">{pick.odds}</p>
                              </div>
                              <button
                                onClick={() => removePick(pick.marketId)}
                                className="text-lg text-zinc-500 hover:text-white"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 rounded-2xl border border-green-400/20 bg-green-400/10 p-4">
                        <p className="text-sm text-zinc-300">Combined Odds</p>
                        <p className="mt-1 text-3xl font-black text-white">{combinedOdds}</p>
                      </div>

                      <button className="mt-5 w-full rounded-2xl bg-white px-4 py-4 font-semibold text-black">
                        Place Ticket
                      </button>
                    </>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;