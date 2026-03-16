import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import { MatchRepository } from './match.repository.js';

describe('MatchRepository', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let repo: MatchRepository;

  beforeEach(() => {
    mockQuery = vi.fn();
    repo = new MatchRepository({ query: mockQuery } as unknown as pg.Pool);
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

  // ── applyMove ────────────────────────────────────────────────────────────────

  describe('applyMove()', () => {
    it('updates position when moving to a valid empty tile', async () => {
      // Player at (3, 0) moves south → (3, 1) — empty tile
      mockQuery
        .mockResolvedValueOnce({ rows: [{ position_x: 3, position_y: 0, alive: true }] })
        .mockResolvedValueOnce({ rows: [] }); // updatePlayerPosition

      const result = await repo.applyMove('match-1', 'player-1', 'south');

      expect(result).toBe(true);
      const [, params] = mockQuery.mock.calls[1] as [string, unknown[]];
      expect(params).toContain(3); // nx
      expect(params).toContain(1); // ny
    });

    it('returns false and skips update when moving into a wall', async () => {
      // Player at (0, 1) moves east → (1, 1) — wall tile
      mockQuery.mockResolvedValueOnce({ rows: [{ position_x: 0, position_y: 1, alive: true }] });

      const result = await repo.applyMove('match-1', 'player-1', 'east');

      expect(result).toBe(false);
      expect(mockQuery).toHaveBeenCalledOnce(); // no UPDATE call
    });

    it('clamps to arena bounds (north from row 0 stays at row 0)', async () => {
      // Player at (0, 0) moves north → clamps to (0, 0) — empty tile
      mockQuery
        .mockResolvedValueOnce({ rows: [{ position_x: 0, position_y: 0, alive: true }] })
        .mockResolvedValueOnce({ rows: [] }); // updatePlayerPosition — same cell

      const result = await repo.applyMove('match-1', 'player-1', 'north');

      expect(result).toBe(true);
      const [, params] = mockQuery.mock.calls[1] as [string, unknown[]];
      expect(params).toContain(0); // nx stays 0
    });

    it('returns false when player is dead', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ position_x: 3, position_y: 0, alive: false }] });

      const result = await repo.applyMove('match-1', 'player-1', 'south');

      expect(result).toBe(false);
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('returns false when player is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.applyMove('match-1', 'ghost', 'east');

      expect(result).toBe(false);
    });
  });

  // ── applyDefend ──────────────────────────────────────────────────────────────

  describe('applyDefend()', () => {
    it('issues UPDATE with LEAST(50, shields + 10) for alive players', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.applyDefend('match-1', 'player-1');

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('LEAST(50, shields + 10)');
      expect(params).toContain('match-1');
      expect(params).toContain('player-1');
    });

    it('includes alive = true filter so dead players are unaffected', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repo.applyDefend('match-1', 'player-1');

      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain('alive = true');
    });
  });

  // ── applyCollect ─────────────────────────────────────────────────────────────

  describe('applyCollect()', () => {
    it('returns a positive gain and updates resources when on a resource_node tile', async () => {
      // Position (0, 4) → DEFAULT_TILE_MAP[4][0] = 'resource_node'
      mockQuery
        .mockResolvedValueOnce({ rows: [{ position_x: 0, position_y: 4, alive: true }] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE resources

      const gain = await repo.applyCollect('match-1', 'player-1');

      expect(gain).toBeGreaterThanOrEqual(50);
      expect(gain).toBeLessThan(150);
      const [sql] = mockQuery.mock.calls[1] as [string, unknown[]];
      expect(sql).toContain('resources = resources + $1');
    });

    it('returns 0 and skips update when not on a resource_node tile', async () => {
      // Position (0, 0) → empty tile
      mockQuery.mockResolvedValueOnce({ rows: [{ position_x: 0, position_y: 0, alive: true }] });

      const gain = await repo.applyCollect('match-1', 'player-1');

      expect(gain).toBe(0);
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('returns 0 when player is dead', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ position_x: 0, position_y: 4, alive: false }] });

      const gain = await repo.applyCollect('match-1', 'player-1');

      expect(gain).toBe(0);
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('returns 0 when player is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const gain = await repo.applyCollect('match-1', 'ghost');

      expect(gain).toBe(0);
    });
  });

  describe('findOpenMatches()', () => {
    it('returns mapped open matches with playerCount cast to number', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'match-1', status: 'ACTIVE', playerCount: '3', hasBots: true }],
      });

      const result = await repo.findOpenMatches();

      expect(result).toEqual([{ id: 'match-1', status: 'ACTIVE', playerCount: 3, hasBots: true }]);
      const sql: string = mockQuery.mock.calls[0]![0];
      expect(sql).toContain('PENDING');
      expect(sql).toContain('ACTIVE');
    });

    it('returns empty array when no open matches exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repo.findOpenMatches();

      expect(result).toEqual([]);
    });
  });
});
