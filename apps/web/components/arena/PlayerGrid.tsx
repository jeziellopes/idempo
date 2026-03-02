'use client';
import type { PlayerState } from '../../store/match.store.js';

// 10×10 grid — default map layout from GAME.md §2.2
const RESOURCE_NODES: [number, number][] = [
  [4, 0], [4, 3], [0, 4], [3, 4], [6, 4], [9, 4],
  [4, 5], [4, 9],
];
const WALLS: [number, number][] = [
  [1, 1], [2, 1], [7, 1], [8, 1],
  [1, 2], [8, 2],
  [1, 7], [8, 7],
  [1, 8], [2, 8], [7, 8], [8, 8],
];

function tileType(x: number, y: number): 'wall' | 'resource' | 'empty' {
  if (WALLS.some(([wx, wy]) => wx === x && wy === y)) return 'wall';
  if (RESOURCE_NODES.some(([rx, ry]) => rx === x && ry === y)) return 'resource';
  return 'empty';
}

const TILE_BASE = 'w-9 h-9 flex items-center justify-center text-xs border border-gray-800 select-none';
const TILE_COLORS = {
  wall: 'bg-[#374151]',
  resource: 'bg-[#064e3b] border-emerald-700',
  empty: 'bg-[#1a1f2e]',
};

interface Props {
  players: PlayerState[];
  currentPlayerId: string | null;
}

export function PlayerGrid({ players, currentPlayerId }: Props) {
  const playerMap = new Map(players.map((p) => [`${p.position.x},${p.position.y}`, p]));

  return (
    <div className="inline-grid grid-cols-10 gap-px bg-gray-900 p-1 rounded-lg border border-gray-700">
      {Array.from({ length: 10 }, (_, y) =>
        Array.from({ length: 10 }, (_, x) => {
          const key = `${x},${y}`;
          const player = playerMap.get(key);
          const type = tileType(x, y);
          const isMe = player?.playerId === currentPlayerId;

          return (
            <div key={key} className={`${TILE_BASE} ${TILE_COLORS[type]} relative`}>
              {type === 'resource' && !player && (
                <span className="text-emerald-400 text-xs">R</span>
              )}
              {type === 'wall' && <span className="text-gray-600">#</span>}
              {player && (
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center rounded ${
                    isMe ? 'ring-2 ring-amber-400' : ''
                  }`}
                >
                  <span className={`text-xs font-bold ${player.alive ? 'text-white' : 'text-gray-600'}`}>
                    {player.username.slice(0, 2).toUpperCase()}
                  </span>
                  {/* HP bar */}
                  <div className="w-6 h-1 bg-gray-700 rounded mt-0.5">
                    <div
                      className={`h-full rounded ${player.hp > 50 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${player.hp}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
