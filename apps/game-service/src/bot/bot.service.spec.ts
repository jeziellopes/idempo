import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('uuid', () => ({ v4: vi.fn(() => 'bot-uuid') }));

import { BotService } from './bot.service.js';
import { MIN_PLAYERS } from '../match/match.types.js';
import type { MatchRepository } from '../match/match.repository.js';
import type { MatchService } from '../match/match.service.js';
import type { MatchPlayer } from '../match/match.types.js';

const makePlayer = (overrides: Partial<MatchPlayer> = {}): MatchPlayer => ({
  matchId: 'match-1',
  playerId: 'player-1',
  username: 'Alice',
  hp: 100,
  score: 0,
  resources: 0,
  shields: 0,
  positionX: 0,
  positionY: 0,
  alive: true,
  team: null,
  finalScore: 0,
  isBot: false,
  ...overrides,
});

describe('BotService', () => {
  let mockRepo: { addPlayer: ReturnType<typeof vi.fn> };
  let mockMatchService: { submitAction: ReturnType<typeof vi.fn> };
  let service: BotService;

  beforeEach(() => {
    mockRepo = { addPlayer: vi.fn().mockResolvedValue(undefined) };
    mockMatchService = { submitAction: vi.fn().mockResolvedValue(undefined) };

    service = new BotService(
      mockRepo as unknown as MatchRepository,
      mockMatchService as unknown as MatchService,
    );
  });

  // ── fillWithBots ──────────────────────────────────────────────────────────────

  describe('fillWithBots()', () => {
    it('adds the correct number of bots', async () => {
      const added = await service.fillWithBots('match-1', 1, MIN_PLAYERS);

      // currentCount=1, targetCount=2 → should add 1 bot
      expect(added).toHaveLength(1);
      expect(mockRepo.addPlayer).toHaveBeenCalledOnce();
    });

    it('calls repo.addPlayer with isBot=true', async () => {
      await service.fillWithBots('match-1', 0, 1);

      const [, , , , , isBot] = mockRepo.addPlayer.mock.calls[0]!;
      expect(isBot).toBe(true);
    });

    it('returns the generated bot UUIDs', async () => {
      const added = await service.fillWithBots('match-1', 0, 2);

      // uuid is mocked to 'bot-uuid' so both calls return the same mock value
      expect(added).toEqual(['bot-uuid', 'bot-uuid']);
    });

    it('does nothing when currentCount === targetCount', async () => {
      const added = await service.fillWithBots('match-1', 2, 2);

      expect(added).toHaveLength(0);
      expect(mockRepo.addPlayer).not.toHaveBeenCalled();
    });

    it('falls back to spawns[0] when playerIndex exceeds the spawn-list length (>MAX_PLAYERS)', async () => {
      // playerIndex 7 → idx capped at MAX_PLAYERS(6) → SPAWN_POSITIONS[6] has 6 entries → spawns[6] undefined
      const added = await service.fillWithBots('match-1', 6, 7);

      expect(added).toHaveLength(1);
      expect(mockRepo.addPlayer).toHaveBeenCalledOnce();
    });
  });

  // ── tickBots ──────────────────────────────────────────────────────────────────

  describe('tickBots()', () => {
    it('calls submitAction for each alive bot', async () => {
      const players: MatchPlayer[] = [
        makePlayer({ playerId: 'human-1', isBot: false }),
        makePlayer({ playerId: 'bot-1', isBot: true }),
        makePlayer({ playerId: 'bot-2', isBot: true }),
      ];

      await service.tickBots('match-1', players);

      expect(mockMatchService.submitAction).toHaveBeenCalledTimes(2);
    });

    it('does not call submitAction for dead bots', async () => {
      const players: MatchPlayer[] = [
        makePlayer({ playerId: 'bot-1', isBot: true, alive: false }),
        makePlayer({ playerId: 'bot-2', isBot: true, alive: true }),
      ];

      await service.tickBots('match-1', players);

      expect(mockMatchService.submitAction).toHaveBeenCalledTimes(1);
    });

    it('does not call submitAction for human players', async () => {
      const players: MatchPlayer[] = [
        makePlayer({ playerId: 'human-1', isBot: false }),
        makePlayer({ playerId: 'human-2', isBot: false }),
      ];

      await service.tickBots('match-1', players);

      expect(mockMatchService.submitAction).not.toHaveBeenCalled();
    });

    it('continues ticking other bots if one action throws', async () => {
      mockMatchService.submitAction
        .mockRejectedValueOnce(new Error('action failed'))
        .mockResolvedValue(undefined);

      const players: MatchPlayer[] = [
        makePlayer({ playerId: 'bot-1', isBot: true }),
        makePlayer({ playerId: 'bot-2', isBot: true }),
      ];

      // Should not throw — errors are swallowed
      await expect(service.tickBots('match-1', players)).resolves.toBeUndefined();
      expect(mockMatchService.submitAction).toHaveBeenCalledTimes(2);
    });

    it('passes useStamp: false for bot actions', async () => {
      const players = [makePlayer({ playerId: 'bot-1', isBot: true })];

      await service.tickBots('match-1', players);

      const dto = mockMatchService.submitAction.mock.calls[0]![2];
      expect(dto.useStamp).toBe(false);
    });
  });
});
