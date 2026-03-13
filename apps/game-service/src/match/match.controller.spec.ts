import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { MatchController } from './match.controller.js';
import type { MatchService } from './match.service.js';

type MockMatchService = Pick<
  MatchService,
  'createOrJoinMatch' | 'joinMatch' | 'getMatchState' | 'submitAction'
>;

/** Helper: build the header args the gateway injects after JWT validation. */
const authHeaders = (playerId = 'p-1', username = 'Alice') => ({ playerId, username });

describe('MatchController', () => {
  let mockService: MockMatchService;
  let controller: MatchController;

  beforeEach(() => {
    mockService = {
      createOrJoinMatch: vi.fn().mockResolvedValue({ matchId: 'match-1', status: 'PENDING', wsToken: 'tok' }),
      joinMatch: vi.fn().mockResolvedValue({ matchId: 'match-1', status: 'ACTIVE', players: [] }),
      getMatchState: vi.fn().mockResolvedValue({ matchId: 'match-1', status: 'ACTIVE', players: [] }),
      submitAction: vi.fn().mockResolvedValue({ accepted: true, duplicate: false }),
    };
    controller = new MatchController(mockService as MatchService);
  });

  // ── createMatch ──────────────────────────────────────────────────────────────

  describe('createMatch()', () => {
    it('reads playerId and username from gateway-injected headers', async () => {
      const { playerId, username } = authHeaders();
      await controller.createMatch(playerId, username);

      expect(mockService.createOrJoinMatch).toHaveBeenCalledWith('p-1', 'Alice');
    });

    it('throws UnauthorizedException when X-Player-Id header is absent', () => {
      expect(() => controller.createMatch(undefined, 'Alice')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when X-Username header is absent', () => {
      expect(() => controller.createMatch('p-1', undefined)).toThrow(UnauthorizedException);
    });
  });

  // ── joinMatch ────────────────────────────────────────────────────────────────

  describe('joinMatch()', () => {
    it('delegates to matchService.joinMatch with matchId from param and identity from headers', async () => {
      const { playerId, username } = authHeaders('p-2', 'Bob');
      await controller.joinMatch('match-1', playerId, username);

      expect(mockService.joinMatch).toHaveBeenCalledWith('match-1', 'p-2', 'Bob');
    });

    it('throws UnauthorizedException when identity headers are missing', () => {
      expect(() => controller.joinMatch('match-1', undefined, undefined)).toThrow(UnauthorizedException);
    });
  });

  // ── getMatch ─────────────────────────────────────────────────────────────────

  describe('getMatch()', () => {
    it('delegates to matchService.getMatchState', async () => {
      await controller.getMatch('match-1');

      expect(mockService.getMatchState).toHaveBeenCalledWith('match-1');
    });
  });

  // ── submitAction ─────────────────────────────────────────────────────────────

  describe('submitAction()', () => {
    const body = { actionType: 'attack' as const, payload: { targetId: 'p-2' } };

    it('throws BadRequestException when X-Idempotency-Key header is missing', () => {
      expect(() => controller.submitAction('match-1', body, undefined, 'p-1')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for an empty string idempotency key', () => {
      expect(() => controller.submitAction('match-1', body, '', 'p-1')).toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when X-Player-Id header is missing', () => {
      expect(() => controller.submitAction('match-1', body, 'key-abc', undefined)).toThrow(UnauthorizedException);
    });

    it('reads playerId from the X-Player-Id header and delegates to matchService', async () => {
      await controller.submitAction('match-1', body, 'key-abc', 'p-1');

      expect(mockService.submitAction).toHaveBeenCalledWith(
        'match-1',
        'p-1',
        expect.objectContaining({ actionId: 'key-abc', actionType: 'attack' }),
      );
    });

    it('defaults payload to {} when not provided in the body', async () => {
      const bodyNoPayload = { actionType: 'move' as const };

      await controller.submitAction('match-1', bodyNoPayload, 'key-xyz', 'p-1');

      expect(mockService.submitAction).toHaveBeenCalledWith(
        'match-1',
        'p-1',
        expect.objectContaining({ payload: {} }),
      );
    });

    it('passes useStamp through to the service', async () => {
      await controller.submitAction('match-1', { ...body, useStamp: true }, 'key-stamp', 'p-1');

      expect(mockService.submitAction).toHaveBeenCalledWith(
        'match-1',
        'p-1',
        expect.objectContaining({ useStamp: true }),
      );
    });
  });
});
