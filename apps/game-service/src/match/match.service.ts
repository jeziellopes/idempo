import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MatchRepository } from './match.repository.js';
import { MatchGateway } from './match.gateway.js';
import {
  SPAWN_POSITIONS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  LOBBY_TIMEOUT_MS,
  MATCH_DURATION_MS,
  TICK_INTERVAL_MS,
  type ActionType,
  type Match,
  type MatchPlayer,
} from './match.types.js';
import { KafkaProducerService } from '../kafka/kafka-producer.service.js';
import { getLogger } from '@idempo/observability';
import { TOPICS } from '@idempo/contracts';

const logger = getLogger('game-service:match');

export interface SubmitActionDto {
  actionType: ActionType;
  payload: Record<string, unknown>;
  /** Client-provided idempotency key. Required for all actions. */
  actionId: string;
  /** When true the stamp is consumed to seal the action */
  useStamp?: boolean;
}

export interface MatchStateDto {
  matchId: string;
  status: string;
  players: Array<{
    playerId: string;
    username: string;
    hp: number;
    score: number;
    resources: number;
    position: { x: number; y: number };
    alive: boolean;
  }>;
  startedAt: string | null;
}

@Injectable()
export class MatchService {
  /** matchId → NodeJS.Timeout for lobby and match duration timers */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly repo: MatchRepository,
    private readonly gateway: MatchGateway,
    private readonly kafka: KafkaProducerService,
  ) {}

  async createOrJoinMatch(playerId: string, username: string): Promise<{ matchId: string; status: string; wsToken: string }> {
    // For v1: create a new match per call; matchmaking can be added later
    const matchId = uuidv4();
    await this.repo.createMatch(matchId);
    await this._addPlayerToMatch(matchId, playerId, username, 1);

    // Start lobby countdown
    const timer = setTimeout(() => void this._onLobbyTimeout(matchId), LOBBY_TIMEOUT_MS);
    this.timers.set(`lobby:${matchId}`, timer);

    logger.info({ matchId, playerId }, 'Match created');
    return { matchId, status: 'PENDING', wsToken: uuidv4() };
  }

  async joinMatch(matchId: string, playerId: string, username: string): Promise<MatchStateDto> {
    const match = await this._requireMatch(matchId);
    if (match.status !== 'PENDING') {
      throw new BadRequestException('Match is not in PENDING state');
    }

    const playerCount = await this.repo.countActivePlayers(matchId);
    if (playerCount >= MAX_PLAYERS) {
      throw new ConflictException('Match is full');
    }

    await this._addPlayerToMatch(matchId, playerId, username, playerCount + 1);

    const newCount = playerCount + 1;
    if (newCount >= MAX_PLAYERS) {
      await this._startMatch(matchId);
    }

    return this.getMatchState(matchId);
  }

  async getMatchState(matchId: string): Promise<MatchStateDto> {
    const match = await this._requireMatch(matchId);
    const players = await this.repo.getPlayers(matchId);
    return this._toDto(match, players);
  }

  /**
   * Submit a player action.
   *
   * Idempotency: `actionId` maps to `player_actions.action_id` (PRIMARY KEY).
   * If a row with that actionId already exists the original result is returned — no duplicate side effects.
   * When `useStamp=true` the Stamp spend is recorded by emitting `StampUsedEvent`;
   * the actual `stamp_balance` decrement lives in the Wallet Service (Iteration 2).
   * In v1 the Stamp constraint is enforced optimistically — the UI is the guardian.
   */
  async submitAction(
    matchId: string,
    playerId: string,
    dto: SubmitActionDto,
  ): Promise<{ accepted: boolean; duplicate: boolean }> {
    const match = await this._requireMatch(matchId);
    if (match.status !== 'ACTIVE') {
      throw new BadRequestException('Match is not ACTIVE');
    }

    // Idempotency: attempt insert — returns false if duplicate
    const inserted = await this.repo.insertAction(
      dto.actionId,
      matchId,
      playerId,
      dto.actionType,
      dto.payload,
    );

    if (!inserted) {
      logger.info({ actionId: dto.actionId }, 'Duplicate action — skipping');
      return { accepted: true, duplicate: true };
    }

    // Emit to Kafka for Combat Service to process
    await this.kafka.send(TOPICS.PLAYER_ACTIONS, {
      key: matchId,
      value: {
        eventId: uuidv4(),
        correlationId: dto.actionId,
        causationId: dto.actionId,
        version: 1,
        type: 'PlayerActionEvent',
        actionId: dto.actionId,
        matchId,
        playerId,
        actionType: dto.actionType,
        payload: dto.payload,
        useStamp: dto.useStamp ?? false,
        timestamp: new Date().toISOString(),
      },
    });

    if (dto.useStamp) {
      await this.kafka.send(TOPICS.MATCH_EVENTS, {
        key: matchId,
        value: {
          eventId: uuidv4(),
          correlationId: dto.actionId,
          causationId: dto.actionId,
          version: 1,
          type: 'StampUsedEvent',
          stampId: dto.actionId,
          actionId: dto.actionId,
          playerId,
          matchId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    logger.info({ actionId: dto.actionId, actionType: dto.actionType, useStamp: dto.useStamp }, 'Action accepted');
    return { accepted: true, duplicate: false };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private async _addPlayerToMatch(matchId: string, playerId: string, username: string, playerIndex: number): Promise<void> {
    // Clamp index to 1-based, get spawn for playerCount up to 6
    const idx = Math.min(playerIndex, MAX_PLAYERS);
    const spawns = SPAWN_POSITIONS[idx] ?? SPAWN_POSITIONS[MAX_PLAYERS]!;
    // Use last spawn position for this player (they're added in order)
    const spawn = spawns[playerIndex - 1] ?? spawns[0]!;
    await this.repo.addPlayer(matchId, playerId, username, spawn.x, spawn.y);
  }

  private async _startMatch(matchId: string): Promise<void> {
    await this.repo.startMatch(matchId);
    clearTimeout(this.timers.get(`lobby:${matchId}`));
    this.timers.delete(`lobby:${matchId}`);

    const players = await this.repo.getPlayers(matchId);
    this.gateway.broadcastMatchState(matchId, { event: 'match:started', players });

    // Schedule match end
    const timer = setTimeout(() => void this._onMatchTimeout(matchId), MATCH_DURATION_MS);
    this.timers.set(`match:${matchId}`, timer);

    // Start tick loop
    this._startTickLoop(matchId);

    logger.info({ matchId }, 'Match started');
  }

  private _startTickLoop(matchId: string): void {
    const tick = setInterval(async () => {
      const match = await this.repo.findMatch(matchId);
      if (!match || match.status !== 'ACTIVE') {
        clearInterval(tick);
        return;
      }
      const players = await this.repo.getPlayers(matchId);
      const alive = players.filter((p) => p.alive);

      if (alive.length <= 1) {
        clearInterval(tick);
        await this._finishMatch(matchId, alive[0]?.playerId ?? null);
        return;
      }

      this.gateway.broadcastMatchState(matchId, { event: 'tick', players });
    }, TICK_INTERVAL_MS);

    this.timers.set(`tick:${matchId}`, tick as unknown as NodeJS.Timeout);
  }

  private async _onLobbyTimeout(matchId: string): Promise<void> {
    const count = await this.repo.countActivePlayers(matchId);
    if (count < MIN_PLAYERS) {
      logger.info({ matchId }, 'Lobby timed out with insufficient players — cancelling');
      this.gateway.broadcastMatchState(matchId, { event: 'match:cancelled' });
      return;
    }
    await this._startMatch(matchId);
  }

  private async _onMatchTimeout(matchId: string): Promise<void> {
    logger.info({ matchId }, 'Match time limit reached — determining winner by score');
    const players = await this.repo.getPlayers(matchId);
    const winner = players.reduce((a, b) => (a.score >= b.score ? a : b));
    await this._finishMatch(matchId, winner.playerId);
  }

  private async _finishMatch(matchId: string, winnerId: string | null): Promise<void> {
    const match = await this.repo.findMatch(matchId);
    if (!match || match.status === 'FINISHED') return;

    await this.repo.finaliseScores(matchId);
    await this.repo.finishMatch(matchId);

    clearTimeout(this.timers.get(`match:${matchId}`));
    this.timers.delete(`match:${matchId}`);

    const players = await this.repo.getPlayers(matchId);

    const event = {
      eventId: uuidv4(),
      correlationId: matchId,
      causationId: matchId,
      version: 1,
      type: 'MatchFinishedEvent',
      matchId,
      winnerId: winnerId ?? '',
      rewards: [
        { type: 'currency', amount: 500 },
        { type: 'stamps', amount: 3 },
      ],
      finalScores: players.map((p) => ({ playerId: p.playerId, score: p.finalScore })),
      timestamp: new Date().toISOString(),
    };

    await this.kafka.send(TOPICS.MATCH_EVENTS, { key: matchId, value: event });
    this.gateway.broadcastMatchState(matchId, { event: 'match:finished', winnerId, finalScores: event.finalScores });

    logger.info({ matchId, winnerId }, 'Match finished');
  }

  private async _requireMatch(matchId: string): Promise<Match> {
    const match = await this.repo.findMatch(matchId);
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);
    return match;
  }

  private _toDto(match: Match, players: MatchPlayer[]): MatchStateDto {
    return {
      matchId: match.id,
      status: match.status,
      startedAt: match.startedAt?.toISOString() ?? null,
      players: players.map((p) => ({
        playerId: p.playerId,
        username: p.username,
        hp: p.hp,
        score: p.score,
        resources: p.resources,
        position: { x: p.positionX, y: p.positionY },
        alive: p.alive,
      })),
    };
  }
}
