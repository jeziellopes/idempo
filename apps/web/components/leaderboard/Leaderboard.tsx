'use client';
import { useEffect, useState } from 'react';
import { api, type LeaderboardEntry } from '../../lib/api';

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api.getLeaderboard();
      setEntries(data.entries);
      setStale(data.meta.stale);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">🏆 Global Leaderboard</h2>
        {stale && (
          <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-1 rounded border border-yellow-700">
            ⚠ Stale cache
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-600 text-sm">No entries yet. Play a match!</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left w-12">Rank</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <tr key={entry.playerId} className={`hover:bg-gray-900/50 ${entry.rank <= 3 ? 'font-semibold' : ''}`}>
                  <td className="px-4 py-3 text-center">
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{entry.username}</td>
                  <td className="px-4 py-3 text-right text-gray-300 font-mono">{entry.score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
