import React, { useState, useEffect } from 'react';
import './App.css';

// Mock battle data
interface Battle {
  id: string;
  coinA: string;
  coinB: string;
  iconA: string;
  iconB: string;
  oddsA: number;
  oddsB: number;
  oddsDraw: number;
  duration: string;
  endsIn: number; // seconds
  status: 'active' | 'settling' | 'settled';
}

interface Pick {
  battleId: string;
  battle: Battle;
  selected: 'A' | 'B' | 'DRAW';
  odds: number;
}

const MOCK_BATTLES: Battle[] = [
  {
    id: '1',
    coinA: 'BTC',
    coinB: 'ETH',
    iconA: '🟠',
    iconB: '🔷',
    oddsA: 1.5,
    oddsB: 2.3,
    oddsDraw: 3.0,
    duration: '5 MIN',
    endsIn: 245, // seconds
    status: 'active'
  },
  {
    id: '2',
    coinA: 'SOL',
    coinB: 'AVAX',
    iconA: '🟣',
    iconB: '🔺',
    oddsA: 1.8,
    oddsB: 1.9,
    oddsDraw: 3.0,
    duration: '15 MIN',
    endsIn: 782,
    status: 'active'
  },
  {
    id: '3',
    coinA: 'HYPE',
    coinB: 'BONK',
    iconA: '⚡',
    iconB: '🐕',
    oddsA: 2.5,
    oddsB: 1.6,
    oddsDraw: 3.0,
    duration: '1 HOUR',
    endsIn: 3421,
    status: 'active'
  }
];

function App() {
  const [battles] = useState<Battle[]>(MOCK_BATTLES);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [tribe, setTribe] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const tribes = [
    { name: 'SOL Degens', icon: '🟣', color: 'bg-purple-600' },
    { name: 'BTC Maxis', icon: '🟠', color: 'bg-orange-500' },
    { name: 'ETH Believers', icon: '🔷', color: 'bg-blue-500' },
  ];

  const addPick = (battle: Battle, selected: 'A' | 'B' | 'DRAW') => {
    // Check if already picked this battle
    if (picks.find(p => p.battleId === battle.id)) {
      alert('Already picked this battle! Remove it first.');
      return;
    }

    if (picks.length >= 3) {
      alert('Maximum 3 picks per parlay!');
      return;
    }

    const odds = selected === 'A' ? battle.oddsA : selected === 'B' ? battle.oddsB : battle.oddsDraw;
    const newPick: Pick = { battleId: battle.id, battle, selected, odds };
    setPicks([...picks, newPick]);
    console.log('Added pick:', newPick);
  };

  const removePick = (battleId: string) => {
    setPicks(picks.filter(p => p.battleId !== battleId));
  };

  const combinedOdds = picks.reduce((acc, pick) => acc * pick.odds, 1);
  const canPlaceParlay = picks.length >= 2;

  const placeParlayBet = () => {
    if (!connected) {
      alert('Please connect your wallet first!');
      return;
    }
    console.log('Placing parlay:', { picks, combinedOdds, stake: 10 });
    alert(`Parlay placed! ${picks.length} picks at ${combinedOdds.toFixed(2)}x odds. (Mock transaction)`);
    setPicks([]);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-black via-green-900 to-black border-b-2 border-green-500 p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-4xl animate-pulse">⚔️</div>
            <div>
              <h1 className="text-3xl font-bold">PREDARENA</h1>
              <p className="text-sm text-gray-400">First Crypto Competition Market</p>
            </div>
          </div>
          <button
            onClick={() => setConnected(!connected)}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              connected
                ? 'bg-green-500 text-black hover:bg-green-400'
                : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {connected ? '✅ Connected' : 'Connect Wallet'}
          </button>
        </div>
      </header>

      {/* Tribe Selection */}
      {!tribe && (
        <div className="bg-gray-900 border-b-2 border-gray-700 p-6">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Choose Your Tribe</h2>
            <div className="flex gap-4">
              {tribes.map(t => (
                <button
                  key={t.name}
                  onClick={() => setTribe(t.name)}
                  className={`${t.color} px-8 py-4 rounded-lg font-bold text-lg hover:scale-105 transition-transform`}
                >
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tribe && (
        <div className="bg-gray-900 border-b-2 border-gray-700 p-4 text-center">
          <p className="text-lg">
            {tribes.find(t => t.name === tribe)?.icon} Tribe:{' '}
            <span className="font-bold">{tribe}</span> •{' '}
            <button onClick={() => setTribe(null)} className="underline text-sm">
              Change
            </button>
          </p>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Battles */}
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-bold mb-4">🔴 Live Competitions</h2>
          <div className="space-y-4">
            {battles.map(battle => (
              <BattleCard key={battle.id} battle={battle} onAddPick={addPick} />
            ))}
          </div>
        </div>

        {/* Parlay Builder */}
        <div>
          <div className="bg-gray-900 rounded-lg p-6 border-2 border-green-500 sticky top-6">
            <h2 className="text-xl font-bold mb-4">🎫 YOUR PARLAY</h2>

            {picks.length === 0 ? (
              <p className="text-gray-400 text-sm mb-4">No picks yet. Add 2-3 battles!</p>
            ) : (
              <div className="space-y-2 mb-4">
                {picks.map(pick => (
                  <div key={pick.battleId} className="bg-black p-3 rounded flex justify-between items-center">
                    <div className="text-sm">
                      <div className="font-bold">
                        {pick.battle.coinA} vs {pick.battle.coinB}
                      </div>
                      <div className="text-gray-400">
                        Pick: {pick.selected === 'A' ? pick.battle.coinA : pick.selected === 'B' ? pick.battle.coinB : 'DRAW'} ({pick.odds}x)
                      </div>
                    </div>
                    <button
                      onClick={() => removePick(pick.battleId)}
                      className="text-red-500 hover:text-red-400"
                    >
                      ❌
                    </button>
                  </div>
                ))}
              </div>
            )}

            {picks.length > 0 && (
              <div className="bg-green-900 p-4 rounded mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Picks:</span>
                  <span className="font-bold">{picks.length}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Combined Odds:</span>
                  <span className="text-green-400">{combinedOdds.toFixed(2)}x</span>
                </div>
              </div>
            )}

            <button
              onClick={placeParlayBet}
              disabled={!canPlaceParlay}
              className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                canPlaceParlay
                  ? 'bg-green-500 text-black hover:bg-green-400 hover:scale-105'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {canPlaceParlay ? 'BUILD PARLAY' : 'Add 2+ picks'}
            </button>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Mock demo • Wallet connection simulated
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black border-t-2 border-gray-700 p-6 mt-12 text-center text-gray-500 text-sm">
        <p>Built on Solana by Humans and AI • GPREDA 💎 • Q3 2026</p>
      </footer>
    </div>
  );
}

function BattleCard({ battle, onAddPick }: { battle: Battle; onAddPick: (b: Battle, s: 'A' | 'B' | 'DRAW') => void }) {
  const [timeLeft, setTimeLeft] = useState(battle.endsIn);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-900 rounded-lg p-6 border-2 border-gray-700 hover:border-green-500 transition-all">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-3 text-2xl mb-2">
            <span>{battle.iconA}</span>
            <span className="font-bold">{battle.coinA}</span>
            <span className="text-gray-500">vs</span>
            <span className="font-bold">{battle.coinB}</span>
            <span>{battle.iconB}</span>
          </div>
          <div className="text-sm text-gray-400">
            ⏱ Ends in: <span className="font-bold text-green-400">{formatTime(timeLeft)}</span> • {battle.duration} Battle
          </div>
        </div>
        <div className="text-2xl cursor-pointer hover:scale-125 transition-transform">
          📈
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onAddPick(battle, 'A')}
          className="bg-orange-500 hover:bg-orange-400 text-black font-bold py-3 px-4 rounded transition-all hover:scale-105"
        >
          <div className="text-sm">{battle.coinA}</div>
          <div className="text-lg">{battle.oddsA}x</div>
        </button>
        <button
          onClick={() => onAddPick(battle, 'DRAW')}
          className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded transition-all hover:scale-105"
        >
          <div className="text-sm">DRAW</div>
          <div className="text-lg">{battle.oddsDraw}x</div>
        </button>
        <button
          onClick={() => onAddPick(battle, 'B')}
          className="bg-purple-500 hover:bg-purple-400 text-black font-bold py-3 px-4 rounded transition-all hover:scale-105"
        >
          <div className="text-sm">{battle.coinB}</div>
          <div className="text-lg">{battle.oddsB}x</div>
        </button>
      </div>
    </div>
  );
}

export default App;
