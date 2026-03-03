import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MatchController } from './match.controller.js';

describe('MatchController', () => {
  let mockService: Record<string, ReturnType<typeof vi.fn>>;
  let controller: MatchController;

  beforeEach(() => {
    mockService = {
      createOrJoinMatch: vi.fn().mockResolvedValue({ matchId: 'match-1', status: 'PENDING', wsToken: 'tok' }),
      joinMatch: vi.fn().mockResolvedValue({ matchId: 'match-1', status: 'ACTIVE', players: [] }),
      getMatchState: vi.fn().mockResolvedValue({ matchId: 'match-1', status: 'ACTIVE', players: [] }),
      submitAction: vi.fn().mockResolvedValue({ accepted: true, duplicate: false }),
    };
    controller = new MatchController(mockService as any);
  });

  // ── createMatch ──────────────────────────────────────────────────────────────

  describe('createMatch()', () => {
    it('delegates to matchService.createOrJoinMatch with playerId and username', async () => {
      await controller.createMatch({ playerId: 'p-1', username: 'Alice' });

      expect(mockService.createOrJoinMatch).toHaveBeenCalledWith('p-1', 'Alice');
    });
  });

  // ── joinMatch ────────────────────────────────────────────────────────────────

  describe('joinMatch()', () => {
    it('delegates to matchService.joinMatch with matchId, playerId, username', async () => {
      await controller.joinMatch('match-1', { playerId: 'p-2', username: 'Bob' });

      expect(mockService.joinMatch).toHaveBeenCalledWith('match-1', 'p-2', 'Bob');
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
    const body = { playerId: 'p-1', actionType: 'attack' as const, payload: { targetId: 'p-2' } };

    it('throws BadRequestException synchronously when X-Idempotency-Key header is missing', () => {
      expect(() => controller.submitAction('match-1', body, undefined)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for an empty string idempotency key', () => {
      expect(() => controller.submitAction('match-1', body, '')).toThrow(BadRequestException);
    });

    it('delegates to matchService.submitAction with the idempotency key as actionId', async () => {
      await controller.submitAction('match-1', body, 'key-abc');

      expect(mockService.submitAction).toHaveBeenCalledWith(
        'match-1',
        'p-1',
        expect.objectContaining({ actionId: 'key-abc', actionType: 'attack' }),
      );
    });

    it('defaults payload to {} when not provided in the body', async () => {
      const bodyNoPayload = { playerId: 'p-1', actionType: 'move' as const };

      await controller.submitAction('match-1', bodyNoPayload as any, 'key-xyz');

      expect(mockService.submitAction).toHaveBeenCalledWith(
        'match-1',
        'p-1',
        expect.objectContaining({ payload: {} }),
      );
    });

    it('passes useStamp through to the service', async () => {
      await controller.submitAction('match-1', { ...body, useStamp: true }, 'key-stamp');

      expect(mockService.submitAction).toHaveBeenCalledWith(
        'match-1',
        'p-1',
        expect.objectContaining({ useStamp: true }),
      );
    });
  });
});
