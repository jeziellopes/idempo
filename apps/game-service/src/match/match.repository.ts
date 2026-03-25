import { Injectable, Inject } from '@nestjs/common';
import type pg from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import type { Match, MatchPlayer, PlayerAction, ActionType, Direction } from './match.types.js';
import { DEFAULT_TILE_MAP } from '../bot/bot.strategy.js';

@Injectable()
export class MatchRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: pg.Pool) {}

  async createMatch(id: string): Promise<Match> {
    const { rows } = await this.pool.query<Match>(
      `INSERT INTO matches (id, status) VALUES ($1, 'PENDING') RETURNING *`,
      [id],
    );
    return rows[0]!;
  }

  async findMatch(id: string): Promise<Match | null> {
    const { rows } = await this.pool.query<Match>(
      `SELECT * FROM matches WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async countActivePlayers(matchId: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM match_players WHERE match_id = $1`,
      [matchId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async addPlayer(matchId: string, playerId: string, username: string, x: number, y: number, isBot = false): Promise<void> {
    await this.pool.query(
      `INSERT INTO match_players
         (match_id, player_id, username, hp, score, resources, shields, position_x, position_y, alive, is_bot)
       VALUES ($1, $2, $3, 100, 0, 0, 0, $4, $5, true, $6)
       ON CONFLICT (match_id, player_id) DO NOTHING`,
      [matchId, playerId, username, x, y, isBot],
    );
  }

  async getPlayers(matchId: string): Promise<MatchPlayer[]> {
    const { rows } = await this.pool.query<MatchPlayer>(
      `SELECT match_id AS "matchId", player_id AS "playerId", username,
              hp, score, resources, shields,
              position_x AS "positionX", position_y AS "positionY",
              alive, team, final_score AS "finalScore", is_bot AS "isBot"
       FROM match_players WHERE match_id = $1`,
      [matchId],
    );
    return rows;
  }

  async startMatch(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE matches SET status = 'ACTIVE', started_at = now() WHERE id = $1`,
      [id],
    );
  }

  async finishMatch(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE matches SET status = 'FINISHED', finished_at = now() WHERE id = $1`,
      [id],
    );
  }

  /** Returns the existing action row if the actionId was already used — idempotency check. */
  async findAction(actionId: string): Promise<PlayerAction | null> {
    const { rows } = await this.pool.query<PlayerAction>(
      `SELECT action_id AS "actionId", match_id AS "matchId", player_id AS "playerId",
              action_type AS "actionType", payload, created_at AS "createdAt"
       FROM player_actions WHERE action_id = $1`,
      [actionId],
    );
    return rows[0] ?? null;
  }

  /**
   * Inserts a player action and, if useStamp=true, atomically decrements the player's
   * stamp_balance from wallet_db (cross-DB is out of scope here — stamp check is done
   * in service layer via in-memory guard for v1; Wallet Service owns stamp_balance).
   *
   * Returns false if the actionId already exists (duplicate — idempotent skip).
   */
  async insertAction(
    actionId: string,
    matchId: string,
    playerId: string,
    actionType: ActionType,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.pool.query(
        `INSERT INTO player_actions (action_id, match_id, player_id, action_type, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [actionId, matchId, playerId, actionType, JSON.stringify(payload)],
      );
      return true;
    } catch (err: unknown) {
      // Unique violation on action_id (SQLSTATE 23505)
      if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
        return false; // duplicate — idempotent skip
      }
      throw err;
    }
  }

  async updatePlayerPosition(matchId: string, playerId: string, x: number, y: number): Promise<void> {
    await this.pool.query(
      `UPDATE match_players SET position_x = $1, position_y = $2
       WHERE match_id = $3 AND player_id = $4`,
      [x, y, matchId, playerId],
    );
  }

  /**
   * Moves a player one tile in the given direction.
   * Clamps to arena bounds and ignores the move if the target tile is a wall
   * or the player is not alive. Returns false when the move was blocked.
   */
  async applyMove(matchId: string, playerId: string, direction: Direction): Promise<boolean> {
    const { rows } = await this.pool.query<{ position_x: number; position_y: number; alive: boolean }>(
      `SELECT position_x, position_y, alive FROM match_players WHERE match_id = $1 AND player_id = $2`,
      [matchId, playerId],
    );
    const row = rows[0];
    if (!row || !row.alive) return false;

    const delta: Record<Direction, { x: number; y: number }> = {
      north: { x: 0, y: -1 },
      south: { x: 0, y: 1 },
      east:  { x: 1, y: 0 },
      west:  { x: -1, y: 0 },
    };
    const d = delta[direction];
    const nx = Math.max(0, Math.min(9, row.position_x + d.x));
    const ny = Math.max(0, Math.min(9, row.position_y + d.y));

    /* v8 ignore next -- DEFAULT_TILE_MAP always covers [0-9][0-9] */
    if (DEFAULT_TILE_MAP[ny]?.[nx] === 'wall') return false;

    await this.updatePlayerPosition(matchId, playerId, nx, ny);
    return true;
  }

  /**
   * Increases the player's shields by 10, capped at 50.
   * No-ops on dead players.
   */
  async applyDefend(matchId: string, playerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE match_players
       SET shields = LEAST(50, shields + 10)
       WHERE match_id = $1 AND player_id = $2 AND alive = true`,
      [matchId, playerId],
    );
  }

  /**
   * Awards resources to a player if they are standing on a resource_node tile.
   * Returns the amount gained (0 when off-node or player is dead).
   */
  async applyCollect(matchId: string, playerId: string): Promise<number> {
    const { rows } = await this.pool.query<{ position_x: number; position_y: number; alive: boolean }>(
      `SELECT position_x, position_y, alive FROM match_players WHERE match_id = $1 AND player_id = $2`,
      [matchId, playerId],
    );
    const row = rows[0];
    if (!row || !row.alive) return 0;

    /* v8 ignore next -- DEFAULT_TILE_MAP always covers [0-9][0-9] */
    const tile = DEFAULT_TILE_MAP[row.position_y]?.[row.position_x];
    if (tile !== 'resource_node') return 0;

    const gain = Math.floor(50 + Math.random() * 100);
    await this.pool.query(
      `UPDATE match_players SET resources = resources + $1
       WHERE match_id = $2 AND player_id = $3`,
      [gain, matchId, playerId],
    );
    return gain;
  }

  async applyDamage(matchId: string, targetId: string, damage: number): Promise<MatchPlayer> {
    const { rows } = await this.pool.query<MatchPlayer>(
      `UPDATE match_players
       SET hp = GREATEST(0, hp - $1),
           alive = (hp - $1 > 0)
       WHERE match_id = $2 AND player_id = $3
       RETURNING match_id AS "matchId", player_id AS "playerId", hp, score, alive,
                 position_x AS "positionX", position_y AS "positionY",
                 shields, resources, username, team, final_score AS "finalScore"`,
      [damage, matchId, targetId],
    );
    return rows[0]!;
  }

  async addScore(matchId: string, playerId: string, points: number): Promise<void> {
    await this.pool.query(
      `UPDATE match_players SET score = score + $1 WHERE match_id = $2 AND player_id = $3`,
      [points, matchId, playerId],
    );
  }

  async finaliseScores(matchId: string): Promise<void> {
    await this.pool.query(
      `UPDATE match_players SET final_score = score WHERE match_id = $1`,
      [matchId],
    );
  }

  async findOpenMatches(): Promise<Array<{ id: string; status: string; playerCount: number; hasBots: boolean }>> {
    const { rows } = await this.pool.query<{ id: string; status: string; playerCount: string; hasBots: boolean }>(
      `SELECT m.id,
              m.status,
              COUNT(mp.player_id)::text AS "playerCount",
              BOOL_OR(mp.is_bot) AS "hasBots"
       FROM matches m
       LEFT JOIN match_players mp ON mp.match_id = m.id
       WHERE m.status IN ('PENDING', 'ACTIVE')
       GROUP BY m.id, m.status
       ORDER BY m.created_at DESC
       LIMIT 20`,
    );
    return rows.map((r) => ({ ...r, playerCount: Number(r.playerCount) }));
  }
}
