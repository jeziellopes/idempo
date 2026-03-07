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
    super({
      clientID: config.getOrThrow<string>('GITHUB_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: `http://localhost:${config.get<number>('PORT', 3010)}/api/auth/github/callback`,
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
