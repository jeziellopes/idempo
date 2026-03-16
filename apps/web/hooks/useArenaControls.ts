'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useMatchStore } from '../store/match.store';
import { api } from '../lib/api';

const THROTTLE_MS = 120;

type Direction = 'north' | 'south' | 'east' | 'west';

const KEY_TO_DIRECTION: Record<string, Direction> = {
  w: 'north', W: 'north', ArrowUp: 'north',
  s: 'south', S: 'south', ArrowDown: 'south',
  a: 'west',  A: 'west',  ArrowLeft: 'west',
  d: 'east',  D: 'east',  ArrowRight: 'east',
};

const PREVENT_DEFAULT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab']);

interface ArenaControlsState {
  /** Whether the next action will be sealed with a Stamp. Toggle with Tab. */
  stampActive: boolean;
}

/**
 * Keyboard controls for the arena. Mount once per player session (not for spectators).
 *
 * Key bindings:
 *   W/↑  — move north      S/↓  — move south
 *   A/←  — move west       D/→  — move east
 *   Space — attack nearest alive enemy (auto-target by Chebyshev distance)
 *   E     — collect resources (only effective on resource_node tiles)
 *   Q     — defend (shields +10, capped at 50)
 *   Tab   — toggle Stamp seal for the next action
 */
export function useArenaControls(matchId: string | null): ArenaControlsState {
  const { playerId, spendStamp } = useMatchStore();
  const [stampActive, setStampActive] = useState(false);

  // Keep a ref in sync so async callbacks read the latest value without stale closures
  const stampActiveRef = useRef(false);
  stampActiveRef.current = stampActive;

  const lastActionRef = useRef<number>(0);

  const submitAction = useCallback(
    async (actionType: string, payload: Record<string, unknown>) => {
      if (!matchId || !playerId) return;

      const useStamp = stampActiveRef.current;
      if (useStamp) {
        const consumed = spendStamp();
        if (!consumed) return; // no stamps remaining
      }

      const actionId = uuidv4();
      try {
        await api.submitAction(matchId, actionType, payload, actionId, useStamp);
        if (useStamp) setStampActive(false);
      } catch {
        // Non-critical — tick will reconcile state
      }
    },
    [matchId, playerId, spendStamp],
  );

  useEffect(() => {
    if (!matchId || !playerId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Never capture input while typing in a form field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;

      if (PREVENT_DEFAULT_KEYS.has(e.key)) e.preventDefault();

      // Tab toggles Stamp — instant, no throttle
      if (e.key === 'Tab') {
        setStampActive((prev) => !prev);
        return;
      }

      // Throttle all game actions
      const now = Date.now();
      if (now - lastActionRef.current < THROTTLE_MS) return;

      // Block actions on finished/cancelled matches
      const { status } = useMatchStore.getState();
      if (status === 'FINISHED' || status === 'CANCELLED') return;

      const direction = KEY_TO_DIRECTION[e.key];
      if (direction) {
        lastActionRef.current = now;
        void submitAction('move', { direction });
        return;
      }

      // Combat actions require ACTIVE match
      if (status !== 'ACTIVE') return;

      if (e.key === ' ') {
        // Auto-target nearest alive enemy by Chebyshev distance
        const state = useMatchStore.getState();
        const me = state.players.find((p) => p.playerId === state.playerId);
        if (!me || !me.alive) return;

        const enemies = state.players.filter((p) => p.playerId !== state.playerId && p.alive);
        if (enemies.length === 0) return;

        const target = enemies.reduce((best, p) => {
          const dBest = Math.max(
            Math.abs(best.position.x - me.position.x),
            Math.abs(best.position.y - me.position.y),
          );
          const dP = Math.max(
            Math.abs(p.position.x - me.position.x),
            Math.abs(p.position.y - me.position.y),
          );
          return dP < dBest ? p : best;
        });

        lastActionRef.current = now;
        void submitAction('attack', { targetId: target.playerId });
        return;
      }

      if (e.key === 'e' || e.key === 'E') {
        lastActionRef.current = now;
        void submitAction('collect', {});
        return;
      }

      if (e.key === 'q' || e.key === 'Q' || e.key === 'Shift') {
        lastActionRef.current = now;
        void submitAction('defend', {});
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [matchId, playerId, submitAction]);

  return { stampActive };
}
