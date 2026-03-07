'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { useMatchStore } from '../store/match.store';
import type { UserDto } from '../lib/api';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001/api';

export default function LobbyPage() {
  const router = useRouter();
  const { hydrate, setMatch } = useMatchStore();
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: check if the user already has a valid session (httpOnly cookie).
  // api.getMe() will redirect to /signin automatically on a 401.
  useEffect(() => {
    api
      .getMe()
      .then((me) => {
        setUser(me);
        hydrate(me.playerId, me.username);
      })
      .catch(() => {
        // Non-401 errors (network failures etc.) — redirect to sign-in.
        router.push('/signin');
      })
      .finally(() => setLoading(false));
  }, [hydrate, router]);

  const findMatch = async () => {
    if (!user) return;
    setJoining(true);
    setError(null);
    try {
      // Identity comes from the JWT cookie — no need to send playerId/username in body.
      const res = await api.createMatch();
      setMatch(res.matchId);
      router.push(`/arena/${res.matchId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const signOut = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      router.push('/signin');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 text-sm animate-pulse">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-8 mt-16">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">⚔️ 𝔦𝔡𝔢𝔪𝔭𝔬</h1>
        <p className="text-gray-400 text-sm">
          Real-time tactical arena · idempotency as game mechanic
        </p>
      </div>

      {user && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-200">
              Welcome, <span className="text-amber-400">{user.username}</span>
            </h2>
            <button
              onClick={() => void signOut()}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={() => void findMatch()}
            disabled={joining}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors"
          >
            {joining ? 'Joining…' : 'Find Match'}
          </button>
        </div>
      )}

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
