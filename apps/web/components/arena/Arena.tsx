'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMatchStore } from '../../store/match.store';
import { useMatchSocket } from '../../hooks/useMatchSocket';
import { PlayerGrid } from './PlayerGrid';
import { ActionPanel } from './ActionPanel';
import { DistributedHUD } from './DistributedHUD';
import { api } from '../../lib/api';

// Three.js scene — dynamically imported to avoid SSR / WebGL issues
const Arena3D = dynamic(
  () => import('./Arena3D').then((m) => ({ default: m.Arena3D })),
  { ssr: false, loading: () => <div className="w-full h-[480px] bg-gray-950 rounded-lg animate-pulse" /> },
);

interface Props {
  matchId: string;
  spectate?: boolean;
}

export function Arena({ matchId, spectate = false }: Props) {
  const { playerId, status, players, lastWinnerId, stampBalance, hydrate, isSpectator, setSpectator, setMatch } = useMatchStore();
  const [use3D, setUse3D] = useState(true);
  useMatchSocket(matchId);

  useEffect(() => {
    if (spectate) {
      setSpectator(matchId);
    } else {
      // Only call setMatch if not already set — avoids resetting state on re-renders
      setMatch(matchId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, spectate]);

  // When the user navigates directly to an arena URL (e.g. via a shared link),
  // the store may not yet have the player identity. Fetch it from the JWT cookie.
  useEffect(() => {
    if (!playerId) {
      api.getMe().then((me) => hydrate(me.playerId, me.username)).catch(() => undefined);
    }
  }, [playerId, hydrate]);

  const activeIsSpectator = spectate || isSpectator;

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center gap-4 p-3 bg-gray-900 rounded-lg border border-gray-700">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
          status === 'ACTIVE' ? 'bg-green-900 text-green-300' :
          status === 'PENDING' ? 'bg-yellow-900 text-yellow-300' :
          status === 'FINISHED' ? 'bg-purple-900 text-purple-300' :
          'bg-gray-800 text-gray-400'
        }`}>{status}</span>
        <span className="text-sm text-gray-400">Match: <code className="text-white">{matchId}</code></span>
        {activeIsSpectator ? (
          <span className="ml-auto text-sm text-sky-400 font-medium">👁 Watching</span>
        ) : (
          <span className="ml-auto text-sm text-amber-400">🔖 Stamps: {stampBalance}</span>
        )}
        <button
          type="button"
          onClick={() => setUse3D((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-2 py-0.5"
        >
          {use3D ? '2D' : '3D'}
        </button>
      </div>

      {status === 'FINISHED' && lastWinnerId && (
        <div className="text-center p-6 bg-purple-900/30 rounded-lg border border-purple-700">
          <p className="text-2xl font-bold text-purple-300">Match Over</p>
          <p className="text-gray-400 mt-1">Winner: <span className="text-white">{lastWinnerId}</span></p>
        </div>
      )}

      {status === 'PENDING' && (
        <div className="text-center p-6 bg-yellow-900/20 rounded-lg border border-yellow-800">
          <p className="text-yellow-300 font-medium">Waiting for players…</p>
          <p className="text-gray-500 text-sm mt-1">
            Match starts automatically (30 s or 6 players) · alone? bots fill after 10 s
          </p>
        </div>
      )}

      <div className="flex gap-6 items-start flex-wrap">
        {/* Grid — 3D or 2D toggle */}
        <div className="flex-shrink-0">
          {use3D ? (
            <Arena3D playerId={activeIsSpectator ? null : playerId} />
          ) : (
            <PlayerGrid players={players} currentPlayerId={activeIsSpectator ? null : playerId} />
          )}
        </div>

        {/* Sidebar */}
        <div className="flex-1 min-w-64 space-y-4">
          {/* Action panel — hidden for spectators */}
          {!activeIsSpectator && playerId && (
            <ActionPanel
              matchId={matchId}
              disabled={status !== 'ACTIVE'}
            />
          )}

          {/* Player list */}
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 space-y-2">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Players</h3>
            {players.length === 0 ? (
              <p className="text-xs text-gray-600">No players yet</p>
            ) : (
              players.map((p) => (
                <div key={p.playerId} className={`flex items-center justify-between text-sm ${!p.alive ? 'opacity-40' : ''}`}>
                  <span className={p.playerId === playerId ? 'text-amber-400 font-medium' : 'text-gray-300'}>
                    {p.username}
                    {p.playerId === playerId ? ' (you)' : ''}
                    {p.isBot ? ' 🤖' : ''}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span title="HP">❤ {p.hp}</span>
                    <span title="Score">★ {p.score}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Distributed Systems HUD */}
          <DistributedHUD />
        </div>
      </div>
    </div>
  );
}
