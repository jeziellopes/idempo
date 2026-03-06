import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module.js';

/** Refresh tokens are valid for 7 days. */
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TokenService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Stores a new refresh token JTI in the DB and optionally revokes
   * the previous one (for rotation).
   * Returns the new jti to be embedded in the signed refresh JWT.
   */
  async rotate(userId: string, previousJti?: string): Promise<{ jti: string; expiresAt: Date }> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await this.pool.query('BEGIN');
    try {
      if (previousJti) {
        await this.pool.query(
          `UPDATE refresh_tokens SET revoked_at = NOW()
           WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
          [userId, previousJti],
        );
      }
      await this.pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, jti, expiresAt],
      );
      await this.pool.query('COMMIT');
    } catch (err) {
      await this.pool.query('ROLLBACK');
      throw err;
    }

    return { jti, expiresAt };
  }

  /**
   * Verifies a JTI is present, unexpired, and un-revoked for the given user.
   * Throws UnauthorizedException if the token cannot be validated.
   */
  async verify(userId: string, jti: string): Promise<void> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM refresh_tokens
       WHERE user_id = $1
         AND token_hash = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [userId, jti],
    );

    if (result.rowCount === 0) {
      throw new UnauthorizedException('Refresh token is invalid, expired, or revoked.');
    }
  }

  /** Revokes all active refresh tokens for a user (logout). */
  async revokeAll(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }
}
