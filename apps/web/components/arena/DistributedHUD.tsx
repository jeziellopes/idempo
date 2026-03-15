'use client';
import { useState } from 'react';
import { useMatchStore } from '../../store/match.store';

const EVENT_COLORS: Record<string, string> = {
  PlayerActionEvent: 'text-red-400',
  StampUsedEvent: 'text-amber-400',
  PlayerAttackedEvent: 'text-orange-400',
  MatchFinishedEvent: 'text-purple-400',
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Collapsible panel that displays the last 20 Kafka/WS events seen by this
 * client — giving a live glimpse into the distributed-systems event pipeline.
 */
export function DistributedHUD() {
  const [open, setOpen] = useState(false);
  const { recentEvents } = useMatchStore();

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>⚡ Event Stream</span>
        <span className="flex items-center gap-2">
          {recentEvents.length > 0 && (
            <span className="bg-gray-700 rounded-full px-1.5 py-0.5 text-gray-300">
              {recentEvents.length}
            </span>
          )}
          <span>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-800 max-h-72 overflow-y-auto">
          {recentEvents.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-600">No events yet — play or watch to see the Kafka pipeline live.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-gray-800">
                  <th className="px-3 py-1 text-left font-normal">Event</th>
                  <th className="px-3 py-1 text-left font-normal">Corr.</th>
                  <th className="px-3 py-1 text-right font-normal">ms</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((e) => (
                  <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className={`px-3 py-1 font-mono ${EVENT_COLORS[e.type] ?? 'text-gray-300'}`}>
                      {e.type.replace('Event', '')}
                      {e.duplicate && (
                        <span className="ml-1 text-cyan-400 font-bold" title="Idempotency hit — duplicate ignored">⟳</span>
                      )}
                      {e.useStamp && (
                        <span className="ml-1 text-amber-400" title="Sealed with Stamp">🔖</span>
                      )}
                    </td>
                    <td className="px-3 py-1 font-mono text-gray-500" title={e.correlationId}>
                      {shortId(e.correlationId)}
                    </td>
                    <td className="px-3 py-1 text-right text-gray-500">{e.latencyMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
