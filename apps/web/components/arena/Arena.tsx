'use client';
import { useMatchStore } from '../../store/match.store';
import { useMatchSocket } from '../../hooks/useMatchSocket';
import { PlayerGrid } from './PlayerGrid';
import { ActionPanel } from './ActionPanel';

interface Props {
  matchId: string;
}

export function Arena({ matchId }: Props) {
  const { playerId, status, players, lastWinnerId, stampBalance } = useMatchStore();
  useMatchSocket(matchId);

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
        <span className="ml-auto text-sm text-amber-400">🔖 Stamps: {stampBalance}</span>
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
          <p className="text-gray-500 text-sm mt-1">Match starts automatically (30 s or 6 players)</p>
        </div>
      )}

      <div className="flex gap-6 items-start flex-wrap">
        {/* Grid */}
        <div>
          <PlayerGrid players={players} currentPlayerId={playerId} />
        </div>

        {/* Sidebar */}
        <div className="flex-1 min-w-64 space-y-4">
          {playerId && (
            <ActionPanel
              matchId={matchId}
              playerId={playerId}
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
                    {p.username} {p.playerId === playerId ? '(you)' : ''}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span title="HP">❤ {p.hp}</span>
                    <span title="Score">★ {p.score}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
