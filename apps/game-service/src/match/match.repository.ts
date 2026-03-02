import { Injectable, Inject } from '@nestjs/common';
import pg from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import type { Match, MatchPlayer, PlayerAction, ActionType } from './match.types.js';

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

  async addPlayer(matchId: string, playerId: string, username: string, x: number, y: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO match_players
         (match_id, player_id, username, hp, score, resources, shields, position_x, position_y, alive)
       VALUES ($1, $2, $3, 100, 0, 0, 0, $4, $5, true)
       ON CONFLICT (match_id, player_id) DO NOTHING`,
      [matchId, playerId, username, x, y],
    );
  }

  async getPlayers(matchId: string): Promise<MatchPlayer[]> {
    const { rows } = await this.pool.query<MatchPlayer>(
      `SELECT match_id AS "matchId", player_id AS "playerId", username,
              hp, score, resources, shields,
              position_x AS "positionX", position_y AS "positionY",
              alive, team, final_score AS "finalScore"
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
}
