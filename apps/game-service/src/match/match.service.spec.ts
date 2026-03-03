import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }));

import { MatchService } from './match.service.js';
import { TICK_INTERVAL_MS, MIN_PLAYERS, MAX_PLAYERS } from './match.types.js';
import { TOPICS } from '@idempo/contracts';

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
  let mockRepo: Record<string, ReturnType<typeof vi.fn>>;
  let mockGateway: { broadcastMatchState: ReturnType<typeof vi.fn> };
  let mockKafka: { send: ReturnType<typeof vi.fn> };
  let service: MatchService;

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

    service = new MatchService(mockRepo as any, mockGateway as any, mockKafka as any);
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

    it('calls startMatch when the joining player reaches MAX_PLAYERS', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));
      mockRepo.countActivePlayers.mockResolvedValue(MAX_PLAYERS - 1);

      await service.joinMatch('match-1', 'player-2', 'Bob');

      expect(mockRepo.startMatch).toHaveBeenCalledWith('match-1');
    });

    it('does not call startMatch when below MAX_PLAYERS', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));
      mockRepo.countActivePlayers.mockResolvedValue(1); // 1 + 1 = 2 < MAX_PLAYERS

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
  });

  // ── _finishMatch ─────────────────────────────────────────────────────────────

  describe('_finishMatch()', () => {
    it('is a no-op when match does not exist', async () => {
      mockRepo.findMatch.mockResolvedValue(null);

      await (service as any)._finishMatch('match-1', null);

      expect(mockRepo.finaliseScores).not.toHaveBeenCalled();
      expect(mockRepo.finishMatch).not.toHaveBeenCalled();
    });

    it('is a no-op when match is already FINISHED', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('FINISHED'));

      await (service as any)._finishMatch('match-1', null);

      expect(mockRepo.finaliseScores).not.toHaveBeenCalled();
      expect(mockRepo.finishMatch).not.toHaveBeenCalled();
    });

    it('finalises scores, marks match finished, emits MatchFinishedEvent, and broadcasts', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('ACTIVE'));
      mockRepo.getPlayers.mockResolvedValue([makePlayer({ finalScore: 200 })]);

      await (service as any)._finishMatch('match-1', 'player-1');

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

      await (service as any)._onLobbyTimeout('match-1');

      expect(mockGateway.broadcastMatchState).toHaveBeenCalledWith('match-1', { event: 'match:cancelled' });
      expect(mockRepo.startMatch).not.toHaveBeenCalled();
    });

    it('starts the match when count >= MIN_PLAYERS', async () => {
      mockRepo.countActivePlayers.mockResolvedValue(MIN_PLAYERS);
      mockRepo.findMatch.mockResolvedValue(makeMatch('PENDING'));

      await (service as any)._onLobbyTimeout('match-1');

      expect(mockRepo.startMatch).toHaveBeenCalledWith('match-1');
    });
  });

  // ── _startTickLoop ───────────────────────────────────────────────────────────

  describe('_startTickLoop()', () => {
    it('clears the interval and does not call getPlayers when match is not ACTIVE', async () => {
      mockRepo.findMatch.mockResolvedValue(makeMatch('FINISHED'));

      (service as any)._startTickLoop('match-1');
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

      (service as any)._startTickLoop('match-1');
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

      (service as any)._startTickLoop('match-1');
      await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);

      expect(mockGateway.broadcastMatchState).toHaveBeenCalledWith(
        'match-1',
        expect.objectContaining({ event: 'tick' }),
      );
    });
  });
});
