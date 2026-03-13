import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { Pool, QueryResult } from 'pg';
import { TokenService } from './token.service.js';

function makePool(rows: unknown[] = [], rowCount = rows.length): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount } as QueryResult),
  } as unknown as Pool;
}

describe('TokenService', () => {
  let pool: Pool;
  let service: TokenService;

  beforeEach(() => {
    pool = makePool([{ id: 'row-uuid' }]);
    service = new TokenService(pool);
  });

  // ── rotate() ──────────────────────────────────────────────────────────────
  describe('rotate()', () => {
    it('opens and commits a transaction', async () => {
      await service.rotate('user-uuid');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
    });

    it('inserts a new refresh_token row', async () => {
      await service.rotate('user-uuid');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refresh_tokens'),
        expect.arrayContaining(['user-uuid']),
      );
    });

    it('revokes the previous JTI when one is provided', async () => {
      await service.rotate('user-uuid', 'old-jti');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens'),
        expect.arrayContaining(['user-uuid', 'old-jti']),
      );
    });

    it('skips the revoke UPDATE when no previousJti is given', async () => {
      await service.rotate('user-uuid');

      const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
        .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE refresh_tokens'));
      expect(updateCalls).toHaveLength(0);
    });

    it('returns a jti string and a future expiresAt', async () => {
      const { jti, expiresAt } = await service.rotate('user-uuid');

      expect(typeof jti).toBe('string');
      expect(jti.length).toBeGreaterThan(0);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('rolls back and re-throws on DB error', async () => {
      (pool.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      await expect(service.rotate('user-uuid')).rejects.toThrow('DB error');
      expect(pool.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // ── verify() ──────────────────────────────────────────────────────────────
  describe('verify()', () => {
    it('resolves without error when the JTI exists in the DB', async () => {
      pool = makePool([{ id: 'row-uuid' }], 1);
      service = new TokenService(pool);

      await expect(service.verify('user-uuid', 'valid-jti')).resolves.toBeUndefined();
    });

    it('throws UnauthorizedException when JTI is not found', async () => {
      pool = makePool([], 0);
      service = new TokenService(pool);

      await expect(service.verify('user-uuid', 'bad-jti')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── revokeAll() ───────────────────────────────────────────────────────────
  describe('revokeAll()', () => {
    it('updates all active tokens to set revoked_at', async () => {
      await service.revokeAll('user-uuid');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens'),
        ['user-uuid'],
      );
    });
  });
});
