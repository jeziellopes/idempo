'use client';
import { create } from 'zustand';

export type MatchStatus = 'idle' | 'PENDING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';

export interface PlayerState {
  playerId: string;
  username: string;
  hp: number;
  score: number;
  resources: number;
  position: { x: number; y: number };
  alive: boolean;
  isBot?: boolean;
}

export interface EventLogEntry {
  id: string;
  type: string;
  correlationId: string;
  eventId: string;
  latencyMs: number;
  timestamp: number;
  useStamp?: boolean;
  duplicate?: boolean;
}

interface MatchStore {
  matchId: string | null;
  playerId: string | null;
  username: string | null;
  status: MatchStatus;
  players: PlayerState[];
  stampBalance: number;
  lastWinnerId: string | null;
  isSpectator: boolean;
  recentEvents: EventLogEntry[];

  /** Set player identity fetched from GET /auth/me (JWT sub + username). */
  hydrate: (playerId: string, username: string) => void;
  setMatch: (matchId: string) => void;
  setSpectator: (matchId: string) => void;
  setStatus: (status: MatchStatus) => void;
  setPlayers: (players: PlayerState[]) => void;
  spendStamp: () => boolean;
  setWinner: (winnerId: string) => void;
  addEvent: (entry: EventLogEntry) => void;
  reset: () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  matchId: null,
  playerId: null,
  username: null,
  status: 'idle',
  players: [],
  stampBalance: 5, // default starting stamps for v1
  lastWinnerId: null,
  isSpectator: false,
  recentEvents: [],

  hydrate: (playerId, username) => set({ playerId, username }),

  setMatch: (matchId) =>
    set({ matchId, status: 'PENDING', isSpectator: false }),

  setSpectator: (matchId) =>
    set({ matchId, status: 'PENDING', isSpectator: true }),

  setStatus: (status) => set({ status }),

  setPlayers: (players) => set({ players }),

  spendStamp: () => {
    const { stampBalance } = get();
    if (stampBalance <= 0) return false;
    set({ stampBalance: stampBalance - 1 });
    return true;
  },

  setWinner: (winnerId) => set({ lastWinnerId: winnerId, status: 'FINISHED' }),

  addEvent: (entry) =>
    set((state) => ({
      recentEvents: [entry, ...state.recentEvents].slice(0, 20),
    })),

  reset: () =>
    set({
      matchId: null,
      playerId: null,
      username: null,
      status: 'idle',
      players: [],
      stampBalance: 5,
      lastWinnerId: null,
      isSpectator: false,
      recentEvents: [],
    }),
}));

