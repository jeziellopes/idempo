import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }));

import { MatchService } from './match.service.js';
import { TICK_INTERVAL_MS, MIN_PLAYERS, MAX_PLAYERS } from './match.types.js';
import { TOPICS } from '@idempo/contracts';
import type { MatchRepository } from './match.repository.js';
import type { MatchGateway } from './match.gateway.js';
import type { KafkaProducerService } from '../kafka/kafka-producer.service.js';
import type { SubmitActionDto } from './match.service.js';

type MockRepo = {
  [K in keyof Pick<
    MatchRepository,
    | 'createMatch'
    | 'findMatch'
    | 'countActivePlayers'
    | 'addPlayer'
    | 'getPlayers'
    | 'startMatch'
    | 'finishMatch'
    | 'insertAction'
    | 'findAction'
    | 'updatePlayerPosition'
    | 'applyDamage'
    | 'addScore'
    | 'finaliseScores'
  >]: ReturnType<typeof vi.fn>;
};

type MockGateway = {
  [K in keyof Pick<MatchGateway, 'broadcastMatchState'>]: ReturnType<typeof vi.fn>;
};

type MockKafka = {
  [K in keyof Pick<KafkaProducerService, 'send'>]: ReturnType<typeof vi.fn>;
};

type MatchServiceInternals = MatchService & {
  _finishMatch(matchId: string, winnerId: string | null): Promise<void>;
  _onLobbyTimeout(matchId: string): Promise<void>;
  _startTickLoop(matchId: string): void;
  _onMatchTimeout(matchId: string): Promise<void>;
  _addPlayerToMatch(matchId: string, playerId: string, username: string, playerIndex: number): Promise<void>;
};

const makeMatch = (status = 'PENDING', id = 'match-1') => ({
  id,
  status,
  startedAt: status === 'ACTIVE' ? new Date() : null,
  finishedAt: null,
  createdAt: new Date(),
});

const makePlayer = (overrides: Record<string, unknown> = {}) => ({
  matchId: 'match-1',
  playerId: 'player-1',
  username: 'Alice',
  hp: 100,
  score: 0,
  resources: 0,
  shields: 0,
  positionX: 0,
  positionY: 0,
  alive: true,
  team: null,
  finalScore: 0,
  ...overrides,
});

describe('MatchService', () => {
  let mockRepo: MockRepo;
  let mockGateway: MockGateway;
  let mockKafka: MockKafka;
  let service: MatchService;
  let internalService: MatchServiceInternals;

  beforeEach(() => {
    vi.useFakeTimers();

    mockRepo = {
      createMatch: vi.fn().mockResolvedValue(makeMatch()),
      findMatch: vi.fn().mockResolvedValue(makeMatch()),
      countActivePlayers: vi.fn().mockResolvedValue(1),
      addPlayer: vi.fn().mockResolvedValue(undefined),
      getPlayers: vi.fn().mockResolvedValue([makePlayer()]),
      startMatch: vi.fn().mockResolvedValue(undefined),
      finishMatch: vi.fn().mockResolvedValue(undefined),
      insertAction: vi.fn().mockResolvedValue(true),
      findAction: vi.fn().mockResolvedValue(null),
      updatePlayerPosition: vi.fn().mockResolvedValue(undefined),
      applyDamage: vi.fn().mockResolvedValue(makePlayer()),
      addScore: vi.fn().mockResolvedValue(undefined),
      finaliseScores: vi.fn().mockResolvedValue(undefined),
    };

    mockGateway = { broadcastMatchState: vi.fn() };
    mockKafka = { send: vi.fn().mockResolvedValue(undefined) };

    service = new MatchService(
      mockRepo as unknown as MatchRepository,
      mockGateway as unknown as MatchGateway,
      mockKafka as unknown as KafkaProducerService,
    );
    internalService = service as unknown as MatchServiceInternals;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── joinMatch ────────────────────────────────────────────────────────────────

  describe('joinMatch()', () => {
    it('throws BadRequestException when match is not PENDING', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));

      await expect(service.joinMatch('match-1', 'player-2', 'Bob'))
        .rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when match is full (playerCount >= MAX_PLAYERS)', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));
      mockRepo.countActivePlayers.mockResolvedValue(MAX_PLAYERS);

      await expect(service.joinMatch('match-1', 'player-2', 'Bob'))
        .rejects.toThrow(ConflictException);
    });

    it('calls startMatch when the joining player reaches MIN_PLAYERS', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));
      mockRepo.countActivePlayers.mockResolvedValue(MIN_PLAYERS - 1); // 1 existing → newCount = MIN_PLAYERS

      await service.joinMatch('match-1', 'player-2', 'Bob');

      expect(mockRepo.startMatch).toHaveBeenCalledWith('match-1');
    });

    it('does not call startMatch when below MIN_PLAYERS', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));
      mockRepo.countActivePlayers.mockResolvedValue(0); // 0 existing → newCount = 1 < MIN_PLAYERS

      await service.joinMatch('match-1', 'player-2', 'Bob');

      expect(mockRepo.startMatch).not.toHaveBeenCalled();
    });
  });

  // ── getMatchState ────────────────────────────────────────────────────────────

  describe('getMatchState()', () => {
    it('throws NotFoundException when match does not exist', async () => {
      mockRepo.findMatch.mockResolvedValue(null);

      await expect(service.getMatchState('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('returns a shaped MatchStateDto', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));
      mockRepo.getPlayers.mockResolvedValue([makePlayer({ score: 42, hp: 80 })]);

      const result = await service.getMatchState('match-1');

      expect(result.matchId).toBe('match-1');
      expect(result.status).toBe('ACTIVE');
      expect(result.players).toHaveLength(1);
      expect(result.players[0]?.score).toBe(42);
      expect(result.players[0]?.hp).toBe(80);
    });
  });

  // ── submitAction ─────────────────────────────────────────────────────────────

  describe('submitAction()', () => {
    const dto = {
      actionId: 'action-1',
      actionType: 'attack' as const,
      payload: { targetId: 'player-2' },
      useStamp: false,
    };

    it('throws BadRequestException when match is not ACTIVE', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));

      await expect(service.submitAction('match-1', 'player-1', dto))
        .rejects.toThrow(BadRequestException);
    });

    it('returns { accepted:true, duplicate:true } when insertAction returns false', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));
      mockRepo.insertAction.mockResolvedValue(false);

      const result = await service.submitAction('match-1', 'player-1', dto);

      expect(result).toEqual({ accepted: true, duplicate: true });
      expect(mockKafka.send).not.toHaveBeenCalled();
    });

    it('returns { accepted:true, duplicate:false } on first submission', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));

      const result = await service.submitAction('match-1', 'player-1', dto);

      expect(result).toEqual({ accepted: true, duplicate: false });
    });

    it('emits exactly one PlayerActionEvent when useStamp=false', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));

      await service.submitAction('match-1', 'player-1', dto);

      expect(mockKafka.send).toHaveBeenCalledOnce();
      expect(mockKafka.send.mock.calls[0]![0]).toBe(TOPICS.PLAYER_ACTIONS);
    });

    it('emits PlayerActionEvent and StampUsedEvent when useStamp=true', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));

      await service.submitAction('match-1', 'player-1', { ...dto, useStamp: true });

      expect(mockKafka.send).toHaveBeenCalledTimes(2);
      const [stampTopic, stampMsg] = mockKafka.send.mock.calls[1]!;
      expect(stampTopic).toBe(TOPICS.MATCH_EVENTS);
      expect(stampMsg.value.type).toBe('StampUsedEvent');
      expect(stampMsg.value.playerId).toBe('player-1');
    });

    it('defaults useStamp to false when the field is undefined (??-branch)', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));
      const dtoNoStamp: SubmitActionDto = { actionId: 'action-2', actionType: 'attack', payload: {} };

      await service.submitAction('match-1', 'player-1', dtoNoStamp);

      expect(mockKafka.send).toHaveBeenCalledOnce();
      const [, msg] = mockKafka.send.mock.calls[0]!;
      expect(msg.value.useStamp).toBe(false);
    });
  });

  // ── _finishMatch ─────────────────────────────────────────────────────────────

  describe('_finishMatch()', () => {
    it('is a no-op when match does not exist', async () => {
      mockRepo.findMatch.mockResolvedValue(null);

      await internalService._finishMatch('match-1', null);

      expect(mockRepo.finaliseScores).not.toHaveBeenCalled();
      expect(mockRepo.finishMatch).not.toHaveBeenCalled();
    });

    it('is a no-op when match is already FINISHED', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('FINISHED'));

      await internalService._finishMatch('match-1', null);

      expect(mockRepo.finaliseScores).not.toHaveBeenCalled();
      expect(mockRepo.finishMatch).not.toHaveBeenCalled();
    });

    it('finalises scores, marks match finished, emits MatchFinishedEvent, and broadcasts', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));
      mockRepo.getPlayers.mockResolvedValue([makePlayer({ finalScore: 200 })]);

      await internalService._finishMatch('match-1', 'player-1');

      expect(mockRepo.finaliseScores).toHaveBeenCalledWith('match-1');
      expect(mockRepo.finishMatch).toHaveBeenCalledWith('match-1');
      expect(mockKafka.send).toHaveBeenCalledWith(
        TOPICS.MATCH_EVENTS,
        expect.objectContaining({
          key: 'match-1',
          value: expect.objectContaining({ type: 'MatchFinishedEvent', matchId: 'match-1', winnerId: 'player-1' }),
        }),
      );
      expect(mockGateway.broadcastMatchState).toHaveBeenCalledWith(
        'match-1',
        expect.objectContaining({ event: 'match:finished', winnerId: 'player-1' }),
      );
    });
  });

  // ── _onLobbyTimeout ──────────────────────────────────────────────────────────

  describe('_onLobbyTimeout()', () => {
    it('broadcasts match:cancelled and does not start when count < MIN_PLAYERS', async () => {
      mockRepo.countActivePlayers.mockResolvedValue(MIN_PLAYERS - 1);

      await internalService._onLobbyTimeout('match-1');

      expect(mockGateway.broadcastMatchState).toHaveBeenCalledWith('match-1', { event: 'match:cancelled' });
      expect(mockRepo.startMatch).not.toHaveBeenCalled();
    });

    it('starts the match when count >= MIN_PLAYERS', async () => {
      mockRepo.countActivePlayers.mockResolvedValue(MIN_PLAYERS);
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));

      await internalService._onLobbyTimeout('match-1');

      expect(mockRepo.startMatch).toHaveBeenCalledWith('match-1');
    });
  });

  // ── _startTickLoop ───────────────────────────────────────────────────────────

  describe('_startTickLoop()', () => {
    it('clears the interval and does not call getPlayers when match is not ACTIVE', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('FINISHED'));

      internalService._startTickLoop('match-1');
      await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);

      expect(mockRepo.getPlayers).not.toHaveBeenCalled();
    });

    it('calls _finishMatch (→ finaliseScores) when only 1 alive player remains', async () => {
      mockRepo.findMatch
        .mockResolvedValueOnce(makeMatch('ACTIVE'))  // tick: is match ACTIVE?
        .mockResolvedValueOnce(makeMatch('ACTIVE')); // _finishMatch: is it already FINISHED?
      mockRepo.getPlayers
        .mockResolvedValueOnce([makePlayer({ alive: true })])          // tick: alive count
        .mockResolvedValueOnce([makePlayer({ finalScore: 100 })]);     // _finishMatch: event

      internalService._startTickLoop('match-1');
      await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);

      expect(mockRepo.finaliseScores).toHaveBeenCalledWith('match-1');
      expect(mockRepo.finishMatch).toHaveBeenCalledWith('match-1');
    });

    it('broadcasts tick state when multiple players are still alive', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));
      mockRepo.getPlayers.mockResolvedValue([
        makePlayer({ alive: true }),
        makePlayer({ playerId: 'player-2', alive: true }),
      ]);

      internalService._startTickLoop('match-1');
      await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);

      expect(mockGateway.broadcastMatchState).toHaveBeenCalledWith(
        'match-1',
        expect.objectContaining({ event: 'tick' }),
      );
    });
  });

  // ── createOrJoinMatch ────────────────────────────────────────────────────────

  describe('createOrJoinMatch()', () => {
    it('creates a match, adds the player, and returns matchId / status / wsToken', async () => {
      mockRepo.createMatch.mockResolvedValue(makeMatch());
      mockRepo.addPlayer.mockResolvedValue(undefined);

      const result = await service.createOrJoinMatch('player-1', 'Alice');

      expect(mockRepo.createMatch).toHaveBeenCalledWith('test-uuid');
      expect(mockRepo.addPlayer).toHaveBeenCalled();
      expect(result).toMatchObject({ matchId: 'test-uuid', status: 'PENDING', wsToken: 'test-uuid' });
    });
  });

  // ── _onMatchTimeout ──────────────────────────────────────────────────────────

  describe('_onMatchTimeout()', () => {
    it('picks the player with the higher score as winner', async () => {
      mockRepo.getPlayers.mockResolvedValue([
        makePlayer({ playerId: 'player-1', score: 100 }),
        makePlayer({ playerId: 'player-2', score: 200 }),
      ]);
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));

      await internalService._onMatchTimeout('match-1');

      const [, msg] = mockKafka.send.mock.calls[0]!;
      expect(msg.value.winnerId).toBe('player-2');
    });

    it('keeps the current leader when the accumulator score is already higher (≥ branch)', async () => {
      mockRepo.getPlayers.mockResolvedValue([
        makePlayer({ playerId: 'player-1', score: 300 }),
        makePlayer({ playerId: 'player-2', score: 100 }),
      ]);
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));

      await internalService._onMatchTimeout('match-1');

      const [, msg] = mockKafka.send.mock.calls[0]!;
      expect(msg.value.winnerId).toBe('player-1');
    });
  });

  // ── branch: null winnerId in _finishMatch ────────────────────────────────────

  describe('_finishMatch() — null winner', () => {
    it('emits MatchFinishedEvent with winnerId="" when winner is null', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));
      mockRepo.getPlayers.mockResolvedValue([makePlayer({ finalScore: 0 })]);

      await internalService._finishMatch('match-1', null);

      const [, msg] = mockKafka.send.mock.calls[0]!;
      expect(msg.value.winnerId).toBe('');
    });
  });

  // ── branch: 0 alive players in _startTickLoop ────────────────────────────────

  describe('_startTickLoop() — 0 alive players', () => {
    it('calls _finishMatch with null winner when no players remain alive', async () => {
      mockRepo.findMatch
        .mockResolvedValueOnce(makeMatch('ACTIVE'))  // tick: is match active?
        .mockResolvedValueOnce(makeMatch('ACTIVE')); // _finishMatch: already finished?
      mockRepo.getPlayers
        .mockResolvedValueOnce([makePlayer({ alive: false })])   // tick: alive check
        .mockResolvedValueOnce([makePlayer({ finalScore: 0 })]); // _finishMatch: event

      internalService._startTickLoop('match-1');
      await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);

      expect(mockRepo.finaliseScores).toHaveBeenCalledWith('match-1');
      const [, msg] = mockKafka.send.mock.calls[0]!;
      expect(msg.value.winnerId).toBe('');
    });
  });

  // ── branch: spawns fallback in _addPlayerToMatch ─────────────────────────────

  describe('_addPlayerToMatch() — spawn position fallback', () => {
    it('falls back to spawns[0] when playerIndex exceeds the spawn array length', async () => {
      mockRepo.addPlayer.mockResolvedValue(undefined);

      // playerIndex=7 > MAX_PLAYERS(6): idx clamped to 6, spawns[6] undefined → spawns[0]
      await internalService._addPlayerToMatch('match-1', 'player-1', 'Alice', 7);

      expect(mockRepo.addPlayer).toHaveBeenCalledWith('match-1', 'player-1', 'Alice', 0, 0);
    });
  });
});
