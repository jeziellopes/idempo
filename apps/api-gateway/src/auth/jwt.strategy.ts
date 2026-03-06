import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

export interface JwtPayload {
  /** users.id UUID — stable server-assigned identity (see identity-service). */
  sub: string;
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * Extracts the JWT from the `accessToken` httpOnly cookie (set by identity-service),
 * with a fallback to the Authorization: Bearer header for CLI / curl usage.
 */
function extractFromCookieThenBearer(req: Request): string | null {
  const fromCookie = (req.cookies as Record<string, string | undefined>)?.accessToken;
  if (fromCookie) return fromCookie;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractFromCookieThenBearer]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: false,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
