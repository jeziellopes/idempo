import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { UserService } from '../users/user.service.js';
import type { UserDto } from '@idempo/contracts';

vi.mock('@nestjs/passport', () => ({
  PassportStrategy: vi.fn().mockImplementation(() =>
    class {
      constructor(_opts?: unknown) {}
    },
  ),
}));

vi.mock('passport-github2', () => ({
  Strategy: class {},
}));

import { GithubStrategy } from './github.strategy.js';

function makeConfig(): ConfigService {
  return {
    getOrThrow: vi.fn().mockImplementation((key: string) => {
      if (key === 'GITHUB_CLIENT_ID') return 'gh-client-id';
      if (key === 'GITHUB_CLIENT_SECRET') return 'gh-client-secret';
      throw new Error(`Missing ${key}`);
    }),
    get: vi.fn().mockReturnValue(3010),
  } as unknown as ConfigService;
}

function makeUserService(user: UserDto): UserService {
  return { upsert: vi.fn().mockResolvedValue(user) } as unknown as UserService;
}

const sampleUser: UserDto = { playerId: 'player-uuid', username: 'octocat', avatarUrl: 'https://github.com/octocat.png' };

describe('GithubStrategy', () => {
  let strategy: GithubStrategy;
  let userService: UserService;

  beforeAll(() => {
    userService = makeUserService(sampleUser);
    strategy = new GithubStrategy(makeConfig(), userService);
  });

  it('calls userService.upsert() with mapped GitHub profile fields', async () => {
    const profile = {
      id: '12345',
      username: 'octocat',
      displayName: 'The Octocat',
      photos: [{ value: 'https://github.com/octocat.png' }],
    };

    const result = await strategy.validate('access-token', 'refresh-token', profile);

    expect(userService.upsert).toHaveBeenCalledWith({
      githubId: 12345,
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: 'https://github.com/octocat.png',
    });
    expect(result).toEqual(sampleUser);
  });

  it('falls back to profile.id when username is absent', async () => {
    const profile = { id: '99', photos: [] };

    await strategy.validate('t', 't', profile);

    expect(userService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ githubLogin: '99' }),
    );
  });
});
