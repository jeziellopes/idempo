import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { UserService } from './user.service.js';

function makePool(rows: unknown[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult),
  } as unknown as Pool;
}

describe('UserService', () => {
  let pool: Pool;
  let service: UserService;

  beforeEach(() => {
    pool = makePool([
      { id: 'stable-uuid', github_login: 'octocat', avatar_url: 'https://github.com/octocat.png' },
    ]);
    service = new UserService(pool);
  });

  // ── upsert() ───────────────────────────────────────────────────────────────
  describe('upsert()', () => {
    it('executes an INSERT … ON CONFLICT upsert query', async () => {
      await service.upsert({ githubId: 12345, githubLogin: 'octocat', displayName: 'Octocat', avatarUrl: 'https://github.com/octocat.png' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [12345, 'octocat', 'Octocat', 'https://github.com/octocat.png'],
      );
    });

    it('returns a UserDto with the stable id from the DB row', async () => {
      const result = await service.upsert({ githubId: 12345, githubLogin: 'octocat' });

      expect(result).toEqual({
        playerId: 'stable-uuid',
        username: 'octocat',
        avatarUrl: 'https://github.com/octocat.png',
      });
    });

    it('maps null avatar_url to undefined in the returned UserDto', async () => {
      pool = makePool([{ id: 'stable-uuid', github_login: 'octocat', avatar_url: null }]);
      service = new UserService(pool);

      const result = await service.upsert({ githubId: 12345, githubLogin: 'octocat' });

      expect(result.avatarUrl).toBeUndefined();
    });

    it('passes null for optional displayName and avatarUrl when not provided', async () => {
      await service.upsert({ githubId: 12345, githubLogin: 'octocat' });

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [12345, 'octocat', null, null]);
    });
  });
});
