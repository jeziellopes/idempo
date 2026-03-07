import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { UserDto, JwtPayload } from '@idempo/contracts';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TokenService, REFRESH_TTL_MS } from '../tokens/token.service.js';

const ACCESS_TOKEN_TTL_S = 15 * 60;            // 15 minutes
const ACCESS_COOKIE_MAX_AGE = ACCESS_TOKEN_TTL_S * 1000;
const REFRESH_COOKIE_MAX_AGE = REFRESH_TTL_MS;

/** Shared httpOnly cookie options. */
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // secure: true is added in production via NODE_ENV check
};

@Controller('auth')
export class AuthController {
  private readonly isProd: boolean;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
  ) {
    this.isProd = config.get<string>('NODE_ENV') === 'production';
  }

  // ── GitHub OAuth ──────────────────────────────────────────────────────────

  /** Redirects browser to GitHub OAuth authorization page. */
  @Get('github')
  @UseGuards(AuthGuard('github'))
  initiateGithubLogin(): void {
    // Passport handles the redirect — this method body never runs.
  }

  /**
   * GitHub redirects here after user authorises.
   * Mints access + refresh tokens, sets httpOnly cookies, then redirects to
   * the web app so the browser lands on a real page.
   */
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const user = req.user as UserDto;
    await this.setAuthCookies(res, user);
    const redirectUrl = this.config.get<string>('WEB_REDIRECT_URL', 'http://localhost:3000');
    res.redirect(redirectUrl);
  }

  // ── Token management ──────────────────────────────────────────────────────

  /**
   * Rotates the refresh token: verifies the existing cookie, issues new
   * access + refresh tokens, and sets fresh cookies.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const rawRefresh: string | undefined = req.cookies?.refreshToken;
    if (!rawRefresh) throw new UnauthorizedException('No refresh token cookie.');

    let payload: { sub: string; jti: string };
    try {
      payload = this.jwtService.verify<{ sub: string; jti: string }>(rawRefresh, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    // Verify the JTI is still valid in the DB (not revoked / expired)
    await this.tokenService.verify(payload.sub, payload.jti);

    // Fetch current user data for the new access token claim
    const user: Pick<UserDto, 'playerId' | 'username'> = {
      playerId: payload.sub,
      username: (payload as unknown as { username?: string }).username ?? '',
    };

    await this.setAuthCookies(res, user as UserDto, payload.jti);
    res.json({ ok: true });
  }

  /**
   * Returns the current user identity from the access token cookie.
   * Useful for bootstrapping the frontend on page load.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request): UserDto {
    const { sub, username } = req.user as JwtPayload;
    return { playerId: sub, username };
  }

  /**
   * Clears auth cookies and revokes all refresh tokens for the user.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { sub } = req.user as JwtPayload;
    await this.tokenService.revokeAll(sub);
    this.clearAuthCookies(res);
    res.json({ ok: true });
  }

  // ── Test bypass ───────────────────────────────────────────────────────────

  /**
   * TEST ONLY — issues an access token cookie for a given playerId + username
   * without going through GitHub OAuth.
   * Disabled entirely in production.
   */
  @Post('test-token')
  @HttpCode(HttpStatus.OK)
  testToken(@Req() req: Request, @Res() res: Response): void {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }

    const { playerId, username } = req.body as { playerId?: string; username?: string };
    if (!playerId || !username) {
      res.status(400).json({ error: 'VALIDATION_ERROR', detail: 'playerId and username are required.' });
      return;
    }

    const accessToken = this.jwtService.sign(
      { sub: playerId, username },
      { expiresIn: ACCESS_TOKEN_TTL_S },
    );
    const cookieOpts = { ...COOKIE_OPTS, ...(this.isProd && { secure: true }) };
    res.cookie('accessToken', accessToken, { ...cookieOpts, maxAge: ACCESS_COOKIE_MAX_AGE });
    res.json({ ok: true });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async setAuthCookies(
    res: Response,
    user: UserDto,
    previousJti?: string,
  ): Promise<void> {
    const { jti, expiresAt } = await this.tokenService.rotate(user.playerId, previousJti);

    const accessToken = this.jwtService.sign(
      { sub: user.playerId, username: user.username },
      { expiresIn: ACCESS_TOKEN_TTL_S },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.playerId, username: user.username, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      },
    );

    const cookieOpts = { ...COOKIE_OPTS, ...(this.isProd && { secure: true }) };
    res.cookie('accessToken', accessToken, { ...cookieOpts, maxAge: ACCESS_COOKIE_MAX_AGE });
    res.cookie('refreshToken', refreshToken, { ...cookieOpts, maxAge: REFRESH_COOKIE_MAX_AGE });
  }

  private clearAuthCookies(res: Response): void {
    const cookieOpts = { ...COOKIE_OPTS, ...(this.isProd && { secure: true }) };
    res.clearCookie('accessToken', cookieOpts);
    res.clearCookie('refreshToken', cookieOpts);
  }
}
