import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException, NotImplementedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { LoginDto, RefreshDto } from './auth.controller.js';
import { AuthController } from './auth.controller.js';

function makeJwtService(token = 'signed.jwt.token'): JwtService {
  return { sign: vi.fn().mockReturnValue(token) } as unknown as JwtService;
}

function makeConfigService(demoPassword = 'idempo'): ConfigService {
  return {
    get: vi.fn().mockReturnValue(demoPassword),
    getOrThrow: vi.fn().mockReturnValue(demoPassword),
  } as unknown as ConfigService;
}

describe('AuthController', () => {
  let controller: AuthController;
  let jwtService: JwtService;
  let configService: ConfigService;

  beforeEach(() => {
    jwtService = makeJwtService();
    configService = makeConfigService('idempo');
    controller = new AuthController(jwtService, configService);
  });

  describe('POST /auth/login', () => {
    it('returns accessToken and expiresIn: 900 on valid credentials', () => {
      const dto: LoginDto = { username: 'alice', password: 'idempo' };
      const result = controller.login(dto);
      expect(result).toEqual({ accessToken: 'signed.jwt.token', expiresIn: 900 });
    });

    it('calls jwtService.sign with sub and username', () => {
      const dto: LoginDto = { username: 'alice', password: 'idempo' };
      controller.login(dto);
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'alice', username: 'alice' });
    });

    it('throws UnauthorizedException on wrong password', () => {
      const dto: LoginDto = { username: 'alice', password: 'wrong' };
      expect(() => controller.login(dto)).toThrow(UnauthorizedException);
    });

    it('reads the expected password from ConfigService', () => {
      const customConfig = makeConfigService('custom-password');
      const ctrl = new AuthController(jwtService, customConfig);
      expect(() => ctrl.login({ username: 'alice', password: 'idempo' })).toThrow(
        UnauthorizedException,
      );
      expect(() => ctrl.login({ username: 'alice', password: 'custom-password' })).not.toThrow();
    });
  });

  describe('POST /auth/refresh', () => {
    it('throws NotImplementedException (Phase 0 stub)', () => {
      const dto: RefreshDto = { refreshToken: 'any-token' };
      expect(() => controller.refresh(dto)).toThrow(NotImplementedException);
    });
  });
});
