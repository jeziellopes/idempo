import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtPayload } from '@idempo/contracts';

vi.mock('@nestjs/passport', () => ({
  PassportStrategy: vi.fn().mockImplementation(() =>
    class {
      constructor(_opts?: unknown) {}
    },
  ),
}));

const mockFromExtractors = vi.fn().mockReturnValue(vi.fn());
vi.mock('passport-jwt', () => ({
  ExtractJwt: { fromExtractors: mockFromExtractors },
  Strategy: class {},
}));

import { ExtractJwt } from 'passport-jwt';
import { JwtStrategy } from './jwt.strategy.js';

function makeConfig(): ConfigService {
  return {
    getOrThrow: vi.fn().mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'jwt-secret-at-least-16-chars';
      throw new Error(`Missing ${key}`);
    }),
  } as unknown as ConfigService;
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeAll(() => {
    strategy = new JwtStrategy(makeConfig());
  });

  it('registers a cookie-first extractor with ExtractJwt.fromExtractors', () => {
    expect(ExtractJwt.fromExtractors).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Function)]),
    );
  });

  describe('extractFromCookieThenBearer()', () => {
    // Retrieve the extractor function registered during construction.
    const getExtractor = () =>
      (ExtractJwt.fromExtractors as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as (
        req: Request,
      ) => string | null;

    it('returns the accessToken cookie when present', () => {
      const extractor = getExtractor();
      const req = {
        cookies: { accessToken: 'cookie-token' },
        headers: {},
      } as unknown as Request;
      expect(extractor(req)).toBe('cookie-token');
    });

    it('falls back to Authorization: Bearer header when no cookie', () => {
      const extractor = getExtractor();
      const req = {
        cookies: {},
        headers: { authorization: 'Bearer bearer-token' },
      } as unknown as Request;
      expect(extractor(req)).toBe('bearer-token');
    });

    it('returns null when neither cookie nor Bearer header is present', () => {
      const extractor = getExtractor();
      const req = { cookies: {}, headers: {} } as unknown as Request;
      expect(extractor(req)).toBeNull();
    });
  });

  describe('validate()', () => {
    it('returns the JWT payload unchanged', () => {
      const payload: JwtPayload = { sub: 'player-uuid', username: 'octocat' };
      expect(strategy.validate(payload)).toEqual(payload);
    });
  });
});
