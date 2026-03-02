'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api.js';
import { useMatchStore } from '../store/match.store.js';
import { v4 as uuidv4 } from 'uuid';

export default function LobbyPage() {
  const router = useRouter();
  const { setMatch } = useMatchStore();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const playerId = uuidv4();
      const res = await api.createMatch(playerId, username.trim());
      setMatch(res.matchId, playerId, username.trim());
      router.push(`/arena/${res.matchId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-8 mt-16">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">⚔️ idempo</h1>
        <p className="text-gray-400 text-sm">
          Real-time tactical arena · idempotency as game mechanic
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-200">Enter the Arena</h2>
        <input
          type="text"
          placeholder="Your username"
          value={username}
          maxLength={20}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void join()}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={() => void join()}
          disabled={!username.trim() || loading}
          className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors"
        >
          {loading ? 'Joining…' : 'Find Match'}
        </button>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">How it works</h3>
        <ul className="space-y-2 text-sm text-gray-500">
          <li>⚡ Join a live 2–6 player match on a 10×10 arena grid</li>
          <li>⚔ Attack, defend, and collect resources each tick (100 ms)</li>
          <li>🔖 Spend an <span className="text-amber-400">idempo Stamp</span> to seal an action — exactly-once, guaranteed</li>
          <li>🏆 Highest score when time runs out wins</li>
        </ul>
      </div>
    </div>
  );
}
