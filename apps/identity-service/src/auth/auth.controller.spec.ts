import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { UserDto, JwtPayload } from '@idempo/contracts';
import { AuthController } from './auth.controller.js';
import type { TokenService } from '../tokens/token.service.js';

// ── Mock factories ───────────────────────────────────────────────────────────

function makeJwtService(accessToken = 'access.jwt', refreshToken = 'refresh.jwt'): JwtService {
  return {
    sign: vi.fn().mockImplementation((_payload: unknown, opts?: { secret?: string }) =>
      opts?.secret ? refreshToken : accessToken,
    ),
    verify: vi.fn().mockReturnValue({ sub: 'player-uuid', username: 'octocat', jti: 'jti-uuid' }),
  } as unknown as JwtService;
}

function makeConfig(env = 'development'): ConfigService {
  return {
    get: vi.fn().mockImplementation((key: string, def?: unknown) => {
      if (key === 'NODE_ENV') return env;
      if (key === 'WEB_REDIRECT_URL') return 'http://localhost:3000';
      if (key === 'PORT') return 3010;
      return def;
    }),
    getOrThrow: vi.fn().mockImplementation((key: string) => {
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret-16+';
      if (key === 'JWT_SECRET') return 'access-secret-16+';
      if (key === 'WEB_REDIRECT_URL') return 'http://localhost:3000';
      throw new Error(`Missing ${key}`);
    }),
  } as unknown as ConfigService;
}

function makeTokenService(): TokenService {
  return {
    rotate: vi.fn().mockResolvedValue({ jti: 'new-jti-uuid', expiresAt: new Date(Date.now() + 86400000) }),
    verify: vi.fn().mockResolvedValue(undefined),
    revokeAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;
}

function makeRes(): Response {
  return {
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    user: undefined,
    cookies: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;
  let jwtService: JwtService;
  let config: ConfigService;
  let tokenService: TokenService;

  beforeEach(() => {
    jwtService = makeJwtService();
    config = makeConfig();
    tokenService = makeTokenService();
    controller = new AuthController(jwtService, config, tokenService);
  });

  // ── GET /auth/github/callback ──────────────────────────────────────────────
  describe('githubCallback()', () => {
    it('sets httpOnly accessToken and refreshToken cookies', async () => {
      const user: UserDto = { playerId: 'player-uuid', username: 'octocat', avatarUrl: 'https://github.com/octocat.png' };
      const req = makeReq({ user });
      const res = makeRes();

      await controller.githubCallback(req, res);

      expect(tokenService.rotate).toHaveBeenCalledWith('player-uuid', undefined);
      expect(res.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access.jwt',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh.jwt',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      );
    });

    it('redirects to WEB_REDIRECT_URL after setting cookies', async () => {
      const user: UserDto = { playerId: 'player-uuid', username: 'octocat' };
      const req = makeReq({ user });
      const res = makeRes();

      await controller.githubCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000');
    });
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  describe('refresh()', () => {
    it('verifies jti, rotates, and sets new cookies', async () => {
      const req = makeReq({ cookies: { refreshToken: 'valid.refresh.jwt' } });
      const res = makeRes();

      await controller.refresh(req, res);

      expect(jwtService.verify).toHaveBeenCalledWith(
        'valid.refresh.jwt',
        expect.objectContaining({ secret: 'refresh-secret-16+' }),
      );
      expect(tokenService.verify).toHaveBeenCalledWith('player-uuid', 'jti-uuid');
      expect(tokenService.rotate).toHaveBeenCalledWith('player-uuid', 'jti-uuid');
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'access.jwt', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('throws UnauthorizedException when no refresh token cookie is present', async () => {
      const req = makeReq({ cookies: {} });
      const res = makeRes();

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when refresh JWT is invalid/expired', async () => {
      (jwtService.verify as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });
      const req = makeReq({ cookies: { refreshToken: 'expired.refresh.jwt' } });
      const res = makeRes();

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── GET /auth/me ───────────────────────────────────────────────────────────
  describe('me()', () => {
    it('returns UserDto from JWT payload', () => {
      const payload: JwtPayload = { sub: 'player-uuid', username: 'octocat' };
      const req = makeReq({ user: payload });

      const result = controller.me(req);

      expect(result).toEqual({ playerId: 'player-uuid', username: 'octocat' });
    });
  });

  // ── POST /auth/logout ──────────────────────────────────────────────────────
  describe('logout()', () => {
    it('revokes all tokens and clears both cookies', async () => {
      const payload: JwtPayload = { sub: 'player-uuid', username: 'octocat' };
      const req = makeReq({ user: payload });
      const res = makeRes();

      await controller.logout(req, res);

      expect(tokenService.revokeAll).toHaveBeenCalledWith('player-uuid');
      expect(res.clearCookie).toHaveBeenCalledWith('accessToken', expect.any(Object));
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  // ── POST /auth/test-token ──────────────────────────────────────────────────
  describe('testToken()', () => {
    it('sets accessToken cookie in non-production environments', () => {
      const req = makeReq({ body: { playerId: 'player-uuid', username: 'octocat' } });
      const res = makeRes();

      controller.testToken(req, res);

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'player-uuid', username: 'octocat' },
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access.jwt',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('returns 404 in production', () => {
      const prodConfig = makeConfig('production');
      const prodController = new AuthController(jwtService, prodConfig, tokenService);
      const req = makeReq({ body: { playerId: 'player-uuid', username: 'octocat' } });
      const res = makeRes();

      prodController.testToken(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('returns 400 when playerId or username is missing', () => {
      const req = makeReq({ body: { username: 'octocat' } }); // missing playerId
      const res = makeRes();

      controller.testToken(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
