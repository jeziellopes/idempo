import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchRepository } from './match.repository.js';

describe('MatchRepository', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let repo: MatchRepository;

  beforeEach(() => {
    mockQuery = vi.fn();
    repo = new MatchRepository({ query: mockQuery } as any);
  });

  // ── createMatch ──────────────────────────────────────────────────────────────

  describe('createMatch()', () => {
    it('inserts a match and returns the created row', async () => {
      const match = { id: 'match-1', status: 'PENDING', startedAt: null, finishedAt: null, createdAt: new Date() };
      mockQuery.mockResolvedValue({ rows: [match] });

      const result = await repo.createMatch('match-1');

      expect(result).toEqual(match);
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain('INSERT INTO matches');
    });
  });

  // ── findMatch ────────────────────────────────────────────────────────────────

  describe('findMatch()', () => {
    it('returns the match when found', async () => {
      const match = { id: 'match-1', status: 'ACTIVE' };
      mockQuery.mockResolvedValue({ rows: [match] });

      const result = await repo.findMatch('match-1');

      expect(result).toEqual(match);
    });

    it('returns null when no match is found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repo.findMatch('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── countActivePlayers ───────────────────────────────────────────────────────

  describe('countActivePlayers()', () => {
    it('returns the player count as a number', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '4' }] });

      const result = await repo.countActivePlayers('match-1');

      expect(result).toBe(4);
    });

    it('returns 0 when no rows are returned (null-safe fallback)', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repo.countActivePlayers('match-1');

      expect(result).toBe(0);
    });
  });

  // ── insertAction ─────────────────────────────────────────────────────────────

  describe('insertAction()', () => {
    it('returns true when the action is inserted successfully', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repo.insertAction('action-1', 'match-1', 'player-1', 'attack', {});

      expect(result).toBe(true);
    });

    it('returns false (idempotent skip) on Postgres unique-violation error (23505)', async () => {
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
      mockQuery.mockRejectedValue(pgError);

      const result = await repo.insertAction('action-1', 'match-1', 'player-1', 'attack', {});

      expect(result).toBe(false);
    });

    it('re-throws unexpected errors that are not unique violations', async () => {
      const otherError = new Error('connection refused');
      mockQuery.mockRejectedValue(otherError);

      await expect(repo.insertAction('action-1', 'match-1', 'player-1', 'attack', {}))
        .rejects.toThrow('connection refused');
    });
  });

  // ── findAction ───────────────────────────────────────────────────────────────

  describe('findAction()', () => {
    it('returns the action when found', async () => {
      const action = { actionId: 'action-1', matchId: 'match-1', playerId: 'player-1' };
      mockQuery.mockResolvedValue({ rows: [action] });

      const result = await repo.findAction('action-1');

      expect(result).toEqual(action);
    });

    it('returns null when action is not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repo.findAction('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── addPlayer ────────────────────────────────────────────────────────────────

  describe('addPlayer()', () => {
    it('executes INSERT ON CONFLICT DO NOTHING for idempotent player join', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.addPlayer('match-1', 'player-1', 'Alice', 0, 0);

      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO NOTHING');
    });
  });

  // ── getPlayers ───────────────────────────────────────────────────────────────

  describe('getPlayers()', () => {
    it('returns mapped player rows for the given match', async () => {
      const players = [
        { matchId: 'match-1', playerId: 'player-1', username: 'Alice', hp: 100, score: 0,
          resources: 0, shields: 0, positionX: 0, positionY: 0, alive: true, team: null, finalScore: 0 },
      ];
      mockQuery.mockResolvedValue({ rows: players });

      const result = await repo.getPlayers('match-1');

      expect(result).toEqual(players);
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain('FROM match_players');
    });
  });

  // ── startMatch ───────────────────────────────────────────────────────────────

  describe('startMatch()', () => {
    it("sets status='ACTIVE' and started_at on the match row", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.startMatch('match-1');

      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain("status = 'ACTIVE'");
    });
  });

  // ── finishMatch ──────────────────────────────────────────────────────────────

  describe('finishMatch()', () => {
    it("sets status='FINISHED' and finished_at on the match row", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.finishMatch('match-1');

      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain("status = 'FINISHED'");
    });
  });

  // ── updatePlayerPosition ─────────────────────────────────────────────────────

  describe('updatePlayerPosition()', () => {
    it('updates position_x and position_y for the given player', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.updatePlayerPosition('match-1', 'player-1', 42, 99);

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('position_x');
      expect(params).toContain(42);
      expect(params).toContain(99);
    });
  });

  // ── applyDamage ──────────────────────────────────────────────────────────────

  describe('applyDamage()', () => {
    it('applies damage via GREATEST(0, hp - $1) and returns the updated player', async () => {
      const updated = { matchId: 'match-1', playerId: 'player-2', hp: 80, alive: true };
      mockQuery.mockResolvedValue({ rows: [updated] });

      const result = await repo.applyDamage('match-1', 'player-2', 20);

      expect(result).toEqual(updated);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('GREATEST');
      expect(params).toContain(20);
    });
  });

  // ── addScore ─────────────────────────────────────────────────────────────────

  describe('addScore()', () => {
    it('increments score by the given points for the player', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.addScore('match-1', 'player-1', 50);

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('score = score + $1');
      expect(params).toContain(50);
    });
  });

  // ── finaliseScores ───────────────────────────────────────────────────────────

  describe('finaliseScores()', () => {
    it('copies score into final_score for all players in the match', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.finaliseScores('match-1');

      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain('final_score = score');
    });
  });
});
