// Domain types for the Game Service

export type MatchStatus = 'PENDING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type ActionType = 'move' | 'attack' | 'defend' | 'collect';
export type Direction = 'north' | 'south' | 'east' | 'west';

export interface Match {
  id: string;
  status: MatchStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface MatchPlayer {
  matchId: string;
  playerId: string;
  username: string;
  hp: number;
  score: number;
  resources: number;
  shields: number;
  positionX: number;
  positionY: number;
  alive: boolean;
  team: number | null;
  finalScore: number;
}

export interface PlayerAction {
  actionId: string;
  matchId: string;
  playerId: string;
  actionType: ActionType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** Spawn positions keyed by player count (2–6) */
export const SPAWN_POSITIONS: Record<number, Array<{ x: number; y: number }>> = {
  2: [{ x: 0, y: 0 }, { x: 9, y: 9 }],
  3: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 4, y: 9 }],
  4: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }, { x: 9, y: 9 }],
  5: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }, { x: 9, y: 9 }, { x: 4, y: 4 }],
  6: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }, { x: 9, y: 9 }, { x: 0, y: 4 }, { x: 9, y: 4 }],
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const LOBBY_TIMEOUT_MS = 30_000;
export const MATCH_DURATION_MS = 5 * 60 * 1_000;
export const TICK_INTERVAL_MS = 100;
