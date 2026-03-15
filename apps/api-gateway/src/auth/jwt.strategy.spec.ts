import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { ConfigService } from '@nestjs/config';

vi.mock('@nestjs/passport', () => ({
  PassportStrategy: vi.fn().mockImplementation(() =>
    class {
      constructor(_opts?: unknown) {}
    },
  ),
}));

vi.mock('passport-jwt', () => ({
  ExtractJwt: {
    fromExtractors: vi.fn().mockReturnValue(vi.fn()),
  },
  Strategy: class {},
}));

import { JwtStrategy, type JwtPayload } from './jwt.strategy.js';

type MockConfigService = Pick<ConfigService, 'getOrThrow'>;

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeAll(() => {
    const mockConfig: MockConfigService = {
      getOrThrow: vi.fn().mockReturnValue('super-secret-jwt-key-16+'),
    };
    strategy = new JwtStrategy(mockConfig as ConfigService);
  });

  it('returns the JWT payload unchanged from validate()', () => {
    // sub is now a UUID, not a username string
    const payload: JwtPayload = {
      sub: 'a1b2c3d4-0000-0000-0000-000000000001',
      username: 'alice',
      iat: 1000,
      exp: 2000,
    };
    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('can be instantiated without throwing when given a ConfigService', () => {
    const mockConfig: MockConfigService = {
      getOrThrow: vi.fn().mockReturnValue('another-secret-key-!!'),
    };
    expect(() => new JwtStrategy(mockConfig as ConfigService)).not.toThrow();
  });

  it('uses fromExtractors (cookie-first then Bearer fallback)', async () => {
    const { ExtractJwt } = await import('passport-jwt');
    // Verify the strategy wires up cookie-first extraction
    expect(ExtractJwt.fromExtractors).toHaveBeenCalled();
  });

  describe('extractFromCookieThenBearer', () => {
    let extractFn: (req: unknown) => string | null;

    beforeAll(async () => {
      const { ExtractJwt } = await import('passport-jwt');
      // Capture the extractor function passed to fromExtractors during construction
      const [extractors] = (ExtractJwt.fromExtractors as ReturnType<typeof vi.fn>).mock.calls[0] as [
        Array<(req: unknown) => string | null>,
      ];
      extractFn = extractors[0];
    });

    it('returns the accessToken cookie when present', () => {
      const req = { cookies: { accessToken: 'cookie-token' }, headers: {} };
      expect(extractFn(req)).toBe('cookie-token');
    });

    it('falls back to Bearer token when cookie is absent', () => {
      const req = { cookies: {}, headers: { authorization: 'Bearer bearer-token' } };
      expect(extractFn(req)).toBe('bearer-token');
    });

    it('returns null when neither cookie nor Authorization header is present', () => {
      const req = { cookies: {}, headers: {} };
      expect(extractFn(req)).toBeNull();
    });

    it('returns null when Authorization header exists but is not Bearer', () => {
      const req = { cookies: {}, headers: { authorization: 'Basic dXNlcjpwYXNz' } };
      expect(extractFn(req)).toBeNull();
    });
  });
});
