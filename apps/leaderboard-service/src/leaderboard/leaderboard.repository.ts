import { Injectable, Inject } from '@nestjs/common';
import type pg from 'pg';
import type Redis from 'ioredis';
import { DATABASE_POOL } from '../database/database.module.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

const REDIS_KEY = 'leaderboard:top100';
const REDIS_TTL_S = 60;

export interface RankEntry {
  playerId: string;
  username: string;
  score: number;
  rank: number;
  updatedAt: string;
}

@Injectable()
export class LeaderboardRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async upsertScore(playerId: string, username: string, scoreDelta: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO ranking_projection (player_id, username, score, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (player_id) DO UPDATE
         SET score = ranking_projection.score + $3,
             username = EXCLUDED.username,
             updated_at = now()`,
      [playerId, username, scoreDelta],
    );
    // Invalidate cache so next read rebuilds from DB
    await this.redis.del(REDIS_KEY);
  }

  async getTop100(): Promise<RankEntry[]> {
    // Try cache first
    const cached = await this.redis.get(REDIS_KEY);
    if (cached) {
      return JSON.parse(cached) as RankEntry[];
    }
    return this._fetchAndCache();
  }

  /** Returns stale cache if DB is unavailable */
  async getTop100WithStaleFallback(): Promise<{ entries: RankEntry[]; stale: boolean }> {
    try {
      const entries = await this._fetchAndCache();
      return { entries, stale: false };
    } catch {
      const cached = await this.redis.get(REDIS_KEY);
      if (cached) {
        return { entries: JSON.parse(cached) as RankEntry[], stale: true };
      }
      return { entries: [], stale: true };
    }
  }

  private async _fetchAndCache(): Promise<RankEntry[]> {
    const { rows } = await this.pool.query<RankEntry>(
      `SELECT player_id AS "playerId", username, score,
              RANK() OVER (ORDER BY score DESC) AS rank,
              updated_at AS "updatedAt"
       FROM ranking_projection
       ORDER BY score DESC
       LIMIT 100`,
    );
    await this.redis.set(REDIS_KEY, JSON.stringify(rows), 'EX', REDIS_TTL_S);
    return rows;
  }
}
