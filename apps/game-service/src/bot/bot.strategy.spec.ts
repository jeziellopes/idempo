import { describe, it, expect } from 'vitest';
import { decideBotAction, DEFAULT_TILE_MAP, type TileType } from './bot.strategy.js';
import type { MatchPlayer } from '../match/match.types.js';

const makePlayer = (overrides: Partial<MatchPlayer> = {}): MatchPlayer => ({
  matchId: 'match-1',
  playerId: 'bot-1',
  username: '⚡ Alpha',
  hp: 100,
  score: 0,
  resources: 0,
  shields: 0,
  positionX: 0,
  positionY: 0,
  alive: true,
  team: null,
  finalScore: 0,
  isBot: true,
  ...overrides,
});

// Flat 10×10 empty map with no walls/resources — useful for movement tests
const emptyMap: TileType[][] = Array.from({ length: 10 }, () =>
  Array.from({ length: 10 }, () => 'empty' as TileType),
);

// Map where the bot sits on a resource_node
const resourceUnderBot: TileType[][] = emptyMap.map((row, ri) =>
  row.map((cell, ci) => (ri === 0 && ci === 0 ? 'resource_node' : cell)),
);

describe('decideBotAction()', () => {
  // ── Priority 1: collect ──────────────────────────────────────────────────────

  describe('priority 1 — collect', () => {
    it('returns collect when bot stands on a resource_node', () => {
      const bot = makePlayer({ positionX: 0, positionY: 0 });
      const result = decideBotAction(bot, [bot], resourceUnderBot);
      expect(result).toEqual({ actionType: 'collect', payload: {} });
    });

    it('returns collect on default tile map when bot is on resource_node (4,0)', () => {
      const bot = makePlayer({ positionX: 4, positionY: 0 });
      const result = decideBotAction(bot, [bot]);
      expect(result).toEqual({ actionType: 'collect', payload: {} });
    });
  });

  // ── Priority 2: defend ───────────────────────────────────────────────────────

  describe('priority 2 — defend', () => {
    it('returns defend when hp < 30 and an enemy is adjacent', () => {
      const bot = makePlayer({ positionX: 3, positionY: 3, hp: 20 });
      const enemy = makePlayer({ playerId: 'enemy-1', positionX: 4, positionY: 3, isBot: false });

      const result = decideBotAction(bot, [bot, enemy], emptyMap);
      expect(result).toEqual({ actionType: 'defend', payload: {} });
    });

    it('does NOT defend when hp < 30 but no adjacent enemy', () => {
      const bot = makePlayer({ positionX: 0, positionY: 0, hp: 20 });
      const enemy = makePlayer({ playerId: 'enemy-1', positionX: 9, positionY: 9, isBot: false });

      const result = decideBotAction(bot, [bot, enemy], emptyMap);
      // Far-away enemy → should move instead
      expect(result.actionType).toBe('move');
    });

    it('does NOT defend when hp >= 30 even with adjacent enemy', () => {
      const bot = makePlayer({ positionX: 3, positionY: 3, hp: 30 });
      const enemy = makePlayer({ playerId: 'enemy-1', positionX: 4, positionY: 3, isBot: false });

      const result = decideBotAction(bot, [bot, enemy], emptyMap);
      // hp is exactly 30 → attack preferred
      expect(result.actionType).toBe('attack');
    });
  });

  // ── Priority 3: attack ───────────────────────────────────────────────────────

  describe('priority 3 — attack', () => {
    it('attacks the adjacent enemy with the lowest HP', () => {
      const bot = makePlayer({ positionX: 5, positionY: 5 });
      const weakEnemy = makePlayer({ playerId: 'weak', positionX: 5, positionY: 6, hp: 20, isBot: false });
      const strongEnemy = makePlayer({ playerId: 'strong', positionX: 6, positionY: 5, hp: 80, isBot: false });

      const result = decideBotAction(bot, [bot, weakEnemy, strongEnemy], emptyMap);
      expect(result).toEqual({ actionType: 'attack', payload: { targetId: 'weak' } });
    });

    it('ignores dead enemies when selecting attack target', () => {
      const bot = makePlayer({ positionX: 5, positionY: 5 });
      const deadEnemy = makePlayer({ playerId: 'dead', positionX: 5, positionY: 6, hp: 10, alive: false, isBot: false });
      const liveEnemy = makePlayer({ playerId: 'live', positionX: 6, positionY: 5, hp: 80, isBot: false });

      const result = decideBotAction(bot, [bot, deadEnemy, liveEnemy], emptyMap);
      expect(result.actionType).toBe('attack');
      expect((result.payload as { targetId: string }).targetId).toBe('live');
    });

    it('does not attack non-adjacent enemies', () => {
      const bot = makePlayer({ positionX: 0, positionY: 0 });
      const farEnemy = makePlayer({ playerId: 'far', positionX: 9, positionY: 9, isBot: false });

      const result = decideBotAction(bot, [bot, farEnemy], emptyMap);
      expect(result.actionType).toBe('move');
    });
  });

  // ── Priority 4: move ─────────────────────────────────────────────────────────

  describe('priority 4 — move', () => {
    it('moves toward the nearest resource_node when no enemies are adjacent', () => {
      // Bot at (5,5) on empty map with a resource_node to the east at (8,5)
      const mapWithResource = emptyMap.map((row, ri) =>
        row.map((cell, ci): TileType => (ri === 5 && ci === 8 ? 'resource_node' : cell)),
      );
      const bot = makePlayer({ positionX: 5, positionY: 5 });

      const result = decideBotAction(bot, [bot], mapWithResource);
      expect(result.actionType).toBe('move');
      expect((result.payload as { direction: string }).direction).toBe('east');
    });

    it('falls back to moving toward nearest enemy when no resource_nodes on map', () => {
      const bot = makePlayer({ positionX: 0, positionY: 0 });
      const enemy = makePlayer({ playerId: 'enemy-1', positionX: 5, positionY: 0, isBot: false });

      const result = decideBotAction(bot, [bot, enemy], emptyMap);
      expect(result.actionType).toBe('move');
      expect((result.payload as { direction: string }).direction).toBe('east');
    });

    it('picks the closer of two enemies when falling back to nearest-enemy move', () => {
      // Bot at (0,0); far enemy at (8,0); near enemy at (3,0) — reducer must pick near enemy
      const bot = makePlayer({ positionX: 0, positionY: 0 });
      const farEnemy = makePlayer({ playerId: 'far', positionX: 8, positionY: 0, isBot: false });
      const nearEnemy = makePlayer({ playerId: 'near', positionX: 3, positionY: 0, isBot: false });

      const result = decideBotAction(bot, [bot, farEnemy, nearEnemy], emptyMap);
      // Bot should move east toward (3,0), not (8,0)
      expect(result.actionType).toBe('move');
      expect((result.payload as { direction: string }).direction).toBe('east');
    });

    it('keeps the first enemy when it is already closer than the second (reducer ? a branch)', () => {
      // Bot at (0,0); near enemy at (3,0) listed first; far enemy at (8,0) listed second
      // reduce: a=near(3), b=far(8) → 3 <= 8 → returns a
      const bot = makePlayer({ positionX: 0, positionY: 0 });
      const nearEnemy = makePlayer({ playerId: 'near', positionX: 3, positionY: 0, isBot: false });
      const farEnemy = makePlayer({ playerId: 'far', positionX: 8, positionY: 0, isBot: false });

      const result = decideBotAction(bot, [bot, nearEnemy, farEnemy], emptyMap);
      expect(result.actionType).toBe('move');
      expect((result.payload as { direction: string }).direction).toBe('east');
    });

    it('returns defend as safe no-op when bot is completely surrounded and cannot move', () => {
      // Build a map where bot is boxed in by walls (position 1,1, surrounded by walls on all 4 sides)
      const boxedMap: TileType[][] = emptyMap.map((row, ri) =>
        row.map((cell, ci): TileType => {
          if (ri === 0 && ci === 1) return 'wall'; // north
          if (ri === 2 && ci === 1) return 'wall'; // south
          if (ri === 1 && ci === 0) return 'wall'; // west
          if (ri === 1 && ci === 2) return 'wall'; // east
          return cell;
        }),
      );
      const bot = makePlayer({ positionX: 1, positionY: 1 });
      const enemy = makePlayer({ playerId: 'enemy', positionX: 9, positionY: 9, isBot: false });

      const result = decideBotAction(bot, [bot, enemy], boxedMap);
      expect(result).toEqual({ actionType: 'defend', payload: {} });
    });

    it('attacks adjacent enemy in path instead of moving (priority 3 preempts priority 4)', () => {
      // Bot at (0,0); target resource at (2,0); but (1,0) is occupied by an adjacent enemy.
      // Chebyshev((0,0),(1,0)) = 1 → attack priority fires before move.
      const mapWithResource = emptyMap.map((row, ri) =>
        row.map((cell, ci): TileType => (ri === 0 && ci === 2 ? 'resource_node' : cell)),
      );
      const bot = makePlayer({ positionX: 0, positionY: 0 });
      const blocker = makePlayer({ playerId: 'blocker', positionX: 1, positionY: 0, isBot: false });

      const result = decideBotAction(bot, [bot, blocker], mapWithResource);
      expect(result.actionType).toBe('attack');
      expect((result.payload as { targetId: string }).targetId).toBe('blocker');
    });

    it('on DEFAULT_TILE_MAP moves toward resource_node when alone', () => {
      const bot = makePlayer({ positionX: 5, positionY: 5 });
      const result = decideBotAction(bot, [bot], DEFAULT_TILE_MAP);
      expect(result.actionType).toBe('move');
    });
  });

  // ── edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles being alone on the map (no enemies) — moves toward resource_node', () => {
      const bot = makePlayer({ positionX: 0, positionY: 0 });
      const result = decideBotAction(bot, [bot]);
      expect(result.actionType).toBe('move');
    });

    it('handles all enemies being dead — no attack, falls back to move', () => {
      const bot = makePlayer({ positionX: 5, positionY: 5 });
      const dead1 = makePlayer({ playerId: 'dead1', positionX: 5, positionY: 6, alive: false, isBot: false });
      const dead2 = makePlayer({ playerId: 'dead2', positionX: 6, positionY: 5, alive: false, isBot: false });

      const result = decideBotAction(bot, [bot, dead1, dead2], emptyMap);
      // No live enemies → move toward resource (or defend if boxed)
      expect(['move', 'defend']).toContain(result.actionType);
    });

    it('moves west when target is to the left (covers dx<0 "west" branch)', () => {
      // Bot at (9,5) on emptyMap; enemy at (3,5) → dx=-1 → west candidates
      const bot = makePlayer({ positionX: 9, positionY: 5 });
      const enemy = makePlayer({ playerId: 'enemy-1', positionX: 3, positionY: 5, isBot: false });

      const result = decideBotAction(bot, [bot, enemy], emptyMap);
      expect(result.actionType).toBe('move');
      expect((result.payload as { direction: string }).direction).toBe('west');
    });

    it('moves north when target is above (covers dy<0 "north" branch)', () => {
      // Bot at (5,9) on emptyMap; enemy at (5,3) → dy=-1 → north candidate
      const bot = makePlayer({ positionX: 5, positionY: 9 });
      const enemy = makePlayer({ playerId: 'enemy-1', positionX: 5, positionY: 3, isBot: false });

      const result = decideBotAction(bot, [bot, enemy], emptyMap);
      expect(result.actionType).toBe('move');
      expect((result.payload as { direction: string }).direction).toBe('north');
    });

    it('attacks the enemy with lower HP when two adjacent enemies are present (covers reduce b branch)', () => {
      // Enemy A (hp=80) adjacent, Enemy B (hp=20) adjacent — reduce should pick B
      const bot = makePlayer({ positionX: 5, positionY: 5, hp: 100 });
      const enemyA = makePlayer({ playerId: 'a', positionX: 5, positionY: 6, hp: 80, isBot: false });
      const enemyB = makePlayer({ playerId: 'b', positionX: 6, positionY: 5, hp: 20, isBot: false });

      const result = decideBotAction(bot, [bot, enemyA, enemyB], emptyMap);
      expect(result.actionType).toBe('attack');
      expect((result.payload as { targetId: string }).targetId).toBe('b');
    });
  });
});
