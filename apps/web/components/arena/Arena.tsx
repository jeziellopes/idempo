'use client';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useMatchStore } from '../../store/match.store';
import { useMatchSocket } from '../../hooks/useMatchSocket';
import { ActionPanel } from './ActionPanel';
import { DistributedHUD } from './DistributedHUD';
import { api } from '../../lib/api';

// Three.js scene — dynamically imported to avoid SSR / WebGL issues
const Arena3D = dynamic(
  () => import('./Arena3D').then((m) => ({ default: m.Arena3D })),
  { ssr: false, loading: () => <div className="w-full h-full bg-gray-950 animate-pulse" /> },
);

const CARD = 'bg-black/60 backdrop-blur-sm rounded-xl border border-white/10 pointer-events-auto';

interface Props {
  matchId: string;
  spectate?: boolean;
}

export function Arena({ matchId, spectate = false }: Props) {
  const { playerId, status, players, lastWinnerId, stampBalance, hydrate, isSpectator, setSpectator, setMatch, hydrateMatch } = useMatchStore();
  useMatchSocket(matchId);

  useEffect(() => {
    if (spectate) {
      setSpectator(matchId);
    } else {
      setMatch(matchId);
    }
  }, [matchId, spectate]);

  // HTTP fallback: fetch current match state on mount so the UI is populated
  // even before the WebSocket emits (or if it missed an earlier broadcast).
  useEffect(() => {
    api.getMatch(matchId)
      .then((state) => hydrateMatch(state.status, state.players as Parameters<typeof hydrateMatch>[1]))
      .catch(() => undefined); // non-critical — WebSocket will catch up
  }, [matchId]);

  useEffect(() => {
    if (!playerId) {
      api.getMe().then((me) => hydrate(me.playerId, me.username)).catch(() => undefined);
    }
  }, [playerId, hydrate]);

  const activeIsSpectator = spectate || isSpectator;

  return (
    // Canvas layer — fills the fixed inset-0 container from arena/layout.tsx
    <div className="relative w-full h-full">

      {/* ── 3D Canvas ── */}
      <Arena3D playerId={activeIsSpectator ? null : playerId} />

      {/* ── Overlay layer (pointer-events-none so OrbitControls still work) ── */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Top-left — match status */}
        <div className={`absolute top-4 left-4 px-3 py-2 flex items-center gap-3 text-sm ${CARD}`}>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
            status === 'ACTIVE'   ? 'bg-green-900  text-green-300'  :
            status === 'PENDING'  ? 'bg-yellow-900 text-yellow-300' :
            status === 'FINISHED' ? 'bg-purple-900 text-purple-300' :
            'bg-gray-800 text-gray-400'
          }`}>{status}</span>
          <code className="text-gray-400 text-xs">{matchId.slice(0, 8)}…</code>
          {activeIsSpectator
            ? <span className="text-sky-400 text-xs font-medium">👁 Watching</span>
            : <span className="text-amber-400 text-xs">🔖 {stampBalance}</span>
          }
        </div>

        {/* Top-right — player list */}
        <div className={`absolute top-4 right-4 w-52 p-3 space-y-1.5 ${CARD}`}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Players</h3>
          {players.length === 0 ? (
            <p className="text-xs text-gray-600">No players yet</p>
          ) : (
            players.map((p) => (
              <div key={p.playerId} className={`flex items-center justify-between text-xs ${!p.alive ? 'opacity-35' : ''}`}>
                <span className={`truncate max-w-[7rem] ${p.playerId === playerId ? 'text-amber-400 font-medium' : 'text-gray-300'}`}>
                  {p.isBot ? '🤖 ' : ''}{p.username}
                  {p.playerId === playerId ? ' ·you' : ''}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {/* HP bar */}
                  <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${p.hp > 50 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${p.hp}%` }}
                    />
                  </div>
                  <span className="text-gray-500 w-6 text-right">{p.hp}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom-center — action panel (players only) */}
        {!activeIsSpectator && playerId && status === 'ACTIVE' && (
          <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 ${CARD}`}>
            <ActionPanel matchId={matchId} disabled={status !== 'ACTIVE'} />
          </div>
        )}

        {/* Bottom-right — distributed HUD */}
        <div className={`absolute bottom-6 right-4 w-72 p-3 ${CARD}`}>
          <DistributedHUD />
        </div>

        {/* Center overlay — PENDING / FINISHED announcements */}
        {status === 'PENDING' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`px-8 py-6 text-center space-y-1 ${CARD}`}>
              <p className="text-yellow-300 font-semibold text-lg">Waiting for players…</p>
              <p className="text-gray-500 text-sm">Match starts when full · bots fill after 10 s</p>
            </div>
          </div>
        )}

        {status === 'FINISHED' && lastWinnerId && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`px-10 py-8 text-center space-y-2 ${CARD}`}>
              <p className="text-3xl font-bold text-purple-300">Match Over</p>
              <p className="text-gray-400">Winner: <span className="text-white font-medium">{lastWinnerId}</span></p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

