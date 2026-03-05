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
}

interface MatchStore {
  matchId: string | null;
  playerId: string | null;
  username: string | null;
  status: MatchStatus;
  players: PlayerState[];
  stampBalance: number;
  lastWinnerId: string | null;

  setMatch: (matchId: string, playerId: string, username: string) => void;
  setStatus: (status: MatchStatus) => void;
  setPlayers: (players: PlayerState[]) => void;
  spendStamp: () => boolean;
  setWinner: (winnerId: string) => void;
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

  setMatch: (matchId, playerId, username) =>
    set({ matchId, playerId, username, status: 'PENDING' }),

  setStatus: (status) => set({ status }),

  setPlayers: (players) => set({ players }),

  spendStamp: () => {
    const { stampBalance } = get();
    if (stampBalance <= 0) return false;
    set({ stampBalance: stampBalance - 1 });
    return true;
  },

  setWinner: (winnerId) => set({ lastWinnerId: winnerId, status: 'FINISHED' }),

  reset: () =>
    set({
      matchId: null,
      playerId: null,
      username: null,
      status: 'idle',
      players: [],
      stampBalance: 5,
      lastWinnerId: null,
    }),
}));
