import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module.js';
import type { UserDto } from '@idempo/contracts';

export interface UpsertUserInput {
  githubId: number;
  githubLogin: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

@Injectable()
export class UserService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Inserts a new user on first GitHub sign-in; updates display_name / avatar_url
   * and bumps updated_at on subsequent logins.
   * Always returns the stable id UUID — never changes after creation.
   */
  async upsert(input: UpsertUserInput): Promise<UserDto> {
    const result = await this.pool.query<{
      id: string;
      github_login: string;
      avatar_url: string | null;
    }>(
      `INSERT INTO users (github_id, github_login, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_id) DO UPDATE
         SET github_login  = EXCLUDED.github_login,
             display_name  = EXCLUDED.display_name,
             avatar_url    = EXCLUDED.avatar_url,
             updated_at    = NOW()
       RETURNING id, github_login, avatar_url`,
      [input.githubId, input.githubLogin, input.displayName ?? null, input.avatarUrl ?? null],
    );

    const row = result.rows[0]!;
    return {
      playerId: row.id,
      username: row.github_login,
      avatarUrl: row.avatar_url ?? undefined,
    };
  }
}
