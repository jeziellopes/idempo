import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-github2';
import { UserService } from '../users/user.service.js';
import type { UserDto } from '@idempo/contracts';

interface GithubProfile {
  id: string;
  username?: string;
  displayName?: string;
  photos?: Array<{ value: string }>;
}

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    config: ConfigService,
    private readonly userService: UserService,
  ) {
    const clientID = config.get<string>('GITHUB_CLIENT_ID', '');
    const clientSecret = config.get<string>('GITHUB_CLIENT_SECRET', '');
    if (!clientID || !clientSecret) {
      // Credentials not configured — GitHub OAuth routes will return 503.
      // The /auth/test-token bypass still works for local dev/CI.
      console.warn(
        '[GithubStrategy] GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not set. ' +
          'GitHub OAuth login will be unavailable.',
      );
    }
    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL: config.get<string>('WEB_REDIRECT_URL', 'http://localhost:3000'),
      scope: ['read:user'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: GithubProfile,
  ): Promise<UserDto> {
    return this.userService.upsert({
      githubId: Number(profile.id),
      githubLogin: profile.username ?? profile.id,
      displayName: profile.displayName ?? null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    });
  }
}
