import type { BaseEvent } from './base-event.js';

// ─── Match Events (topic: match-events) ──────────────────────────────────────

export interface PlayerAttackedEvent extends BaseEvent {
  type: 'PlayerAttackedEvent';
  actionId: string;
  playerId: string;
  targetId: string;
  matchId: string;
  damage: number;
}

export interface StampUsedEvent extends BaseEvent {
  type: 'StampUsedEvent';
  /** stampId === actionId — the stamp UUID *is* the idempotency key */
  stampId: string;
  actionId: string;
  playerId: string;
  matchId: string;
}

export interface MatchFinishedEvent extends BaseEvent {
  type: 'MatchFinishedEvent';
  matchId: string;
  winnerId: string;
  rewards: MatchReward[];
  finalScores: PlayerScore[];
}

export interface MatchReward {
  type: 'currency' | 'item' | 'stamps';
  amount?: number;
  itemId?: string;
}

export interface PlayerScore {
  playerId: string;
  score: number;
}

// ─── Economy Events (topic: economy-events) ──────────────────────────────────

export interface TradeRequestedEvent extends BaseEvent {
  type: 'TradeRequestedEvent';
  tradeId: string;
  buyerId: string;
  sellerId: string;
  itemId: string;
  price: number;
}

// ─── Saga Commands & Replies (topic: economy-events) ─────────────────────────

export interface ReserveFundsCommand extends BaseEvent {
  type: 'ReserveFundsCommand';
  tradeId: string;
  playerId: string;
  amount: number;
}

export interface FundsReservedEvent extends BaseEvent {
  type: 'FundsReservedEvent';
  tradeId: string;
  playerId: string;
  amount: number;
}

export interface FundsReservationFailedEvent extends BaseEvent {
  type: 'FundsReservationFailedEvent';
  tradeId: string;
  playerId: string;
  reason: string;
}

export interface LockItemCommand extends BaseEvent {
  type: 'LockItemCommand';
  tradeId: string;
  itemId: string;
  playerId: string;
}

export interface ItemLockedEvent extends BaseEvent {
  type: 'ItemLockedEvent';
  tradeId: string;
  itemId: string;
}

export interface ItemLockFailedEvent extends BaseEvent {
  type: 'ItemLockFailedEvent';
  tradeId: string;
  itemId: string;
  reason: string;
}

export interface TransferFundsCommand extends BaseEvent {
  type: 'TransferFundsCommand';
  tradeId: string;
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
}

export interface TransferItemCommand extends BaseEvent {
  type: 'TransferItemCommand';
  tradeId: string;
  itemId: string;
  fromPlayerId: string;
  toPlayerId: string;
}

export interface FundsTransferredEvent extends BaseEvent {
  type: 'FundsTransferredEvent';
  tradeId: string;
}

export interface ItemTransferredEvent extends BaseEvent {
  type: 'ItemTransferredEvent';
  tradeId: string;
  itemId: string;
}

export interface ReleaseFundsCommand extends BaseEvent {
  type: 'ReleaseFundsCommand';
  tradeId: string;
  playerId: string;
  amount: number;
}

export interface UnlockItemCommand extends BaseEvent {
  type: 'UnlockItemCommand';
  tradeId: string;
  itemId: string;
}

// ─── Leaderboard Events (topic: leaderboard-events) ──────────────────────────

export interface LeaderboardUpdatedEvent extends BaseEvent {
  type: 'LeaderboardUpdatedEvent';
  playerId: string;
  username: string;
  score: number;
}

// ─── Discriminated union of all events ───────────────────────────────────────

export type MatchEvent = PlayerAttackedEvent | StampUsedEvent | MatchFinishedEvent;

export type EconomyEvent =
  | TradeRequestedEvent
  | ReserveFundsCommand
  | FundsReservedEvent
  | FundsReservationFailedEvent
  | LockItemCommand
  | ItemLockedEvent
  | ItemLockFailedEvent
  | TransferFundsCommand
  | TransferItemCommand
  | FundsTransferredEvent
  | ItemTransferredEvent
  | ReleaseFundsCommand
  | UnlockItemCommand;

export type LeaderboardEvent = LeaderboardUpdatedEvent;

export type AnyIdempoEvent = MatchEvent | EconomyEvent | LeaderboardEvent;
