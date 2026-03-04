'use client';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useMatchStore } from '../../store/match.store';
import { api } from '../../lib/api';

type Direction = 'north' | 'south' | 'east' | 'west';

interface Props {
  matchId: string;
  playerId: string;
  disabled?: boolean;
}

export function ActionPanel({ matchId, playerId, disabled = false }: Props) {
  const { stampBalance, spendStamp } = useMatchStore();
  const [useStamp, setUseStamp] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');

  const send = async (actionType: string, payload: Record<string, unknown>) => {
    const idempotencyKey = uuidv4();

    if (useStamp) {
      const consumed = spendStamp();
      if (!consumed) {
        setStatus('No Stamps remaining');
        return;
      }
    }

    try {
      const res = await api.submitAction(matchId, playerId, actionType, payload, idempotencyKey, useStamp);
      setStatus(res.duplicate ? '↩ Duplicate (idempotent)' : '✓ Accepted');
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
    setTimeout(() => setStatus(null), 2000);
  };

  const move = (dir: Direction) => send('move', { direction: dir });
  const attack = () => send('attack', { targetId });
  const defend = () => send('defend', {});
  const collect = () => send('collect', {});

  const btnClass = (color: string) =>
    `px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40 ${color}`;

  return (
    <div className="space-y-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Actions</h3>

      {/* Movement */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Move</p>
        <div className="grid grid-cols-3 gap-1 w-28">
          <div />
          <button disabled={disabled} onClick={() => move('north')} className={btnClass('bg-gray-700 hover:bg-gray-600')}>↑</button>
          <div />
          <button disabled={disabled} onClick={() => move('west')} className={btnClass('bg-gray-700 hover:bg-gray-600')}>←</button>
          <div />
          <button disabled={disabled} onClick={() => move('east')} className={btnClass('bg-gray-700 hover:bg-gray-600')}>→</button>
          <div />
          <button disabled={disabled} onClick={() => move('south')} className={btnClass('bg-gray-700 hover:bg-gray-600')}>↓</button>
          <div />
        </div>
      </div>

      {/* Combat */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Target player ID"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-300"
        />
        <div className="flex gap-2">
          <button disabled={disabled || !targetId} onClick={attack}
            className={btnClass('bg-red-900 hover:bg-red-800 flex-1')}>⚔ Attack</button>
          <button disabled={disabled} onClick={defend}
            className={btnClass('bg-blue-900 hover:bg-blue-800 flex-1')}>🛡 Defend</button>
          <button disabled={disabled} onClick={collect}
            className={btnClass('bg-emerald-900 hover:bg-emerald-800 flex-1')}>📦 Collect</button>
        </div>
      </div>

      {/* Stamp toggle */}
      <label className={`flex items-center gap-2 cursor-pointer select-none ${stampBalance === 0 ? 'opacity-40' : ''}`}>
        <input
          type="checkbox"
          checked={useStamp}
          disabled={stampBalance === 0}
          onChange={(e) => setUseStamp(e.target.checked)}
          className="accent-amber-400"
        />
        <span className="text-sm text-amber-400 font-medium">
          🔖 Seal with Stamp ({stampBalance} left)
        </span>
      </label>

      {status && (
        <p className="text-xs text-center text-gray-400 animate-pulse">{status}</p>
      )}
    </div>
  );
}
