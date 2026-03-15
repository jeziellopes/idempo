/**
 * Tactical rule-based bot strategy.
 *
 * Priority order per tick:
 *  1. Collect  — if the bot is standing on a resource_node
 *  2. Defend   — if hp < 30 and at least one enemy is adjacent (Chebyshev ≤ 1)
 *  3. Attack   — if any alive opponent is adjacent (Chebyshev ≤ 1), target lowest HP
 *  4. Move     — advance toward nearest resource_node; if none, advance toward nearest
 *                living opponent; use simple greedy step (no wall-dodge in v1.5)
 *
 * This is a pure function — no I/O, no state — so it is 100% unit-testable.
 */

import type { MatchPlayer, ActionType, Direction } from '../match/match.types.js';

export type TileType = 'empty' | 'resource_node' | 'wall';

export interface BotDecision {
  actionType: ActionType;
  payload: Record<string, unknown>;
}

/** Default 10×10 map matching GAME.md §2.2 */
export const DEFAULT_TILE_MAP: TileType[][] = [
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
  ['empty','wall', 'wall', 'empty','empty',        'empty','empty','wall', 'wall', 'empty'],
  ['empty','wall', 'empty','empty','empty',        'empty','empty','empty','wall', 'empty'],
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
  ['resource_node','empty','empty','resource_node','empty','empty','resource_node','empty','empty','resource_node'],
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
  ['empty','empty','empty','empty','empty',        'empty','empty','empty','empty','empty'],
  ['empty','wall', 'empty','empty','empty',        'empty','empty','empty','wall', 'empty'],
  ['empty','wall', 'wall', 'empty','empty',        'empty','empty','wall', 'wall', 'empty'],
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
];

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function greedyStep(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tiles: TileType[][],
  occupied: Set<string>,
): Direction | null {
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);

  // Prefer the dominant axis first, then diagonal, then the other axis.
  const candidates: Direction[] = [];
  if (dx !== 0 || dy !== 0) {
    if (dx !== 0) candidates.push(dx > 0 ? 'east' : 'west');
    if (dy !== 0) candidates.push(dy > 0 ? 'south' : 'north');
    if (dx !== 0) candidates.push(dx > 0 ? 'east' : 'west'); // fallback repeat
  }

  const dirVec: Record<Direction, { x: number; y: number }> = {
    north: { x: 0, y: -1 },
    south: { x: 0, y: 1 },
    east:  { x: 1, y: 0 },
    west:  { x: -1, y: 0 },
  };

  for (const dir of candidates) {
    const nx = fromX + dirVec[dir].x;
    const ny = fromY + dirVec[dir].y;
    if (nx < 0 || nx > 9 || ny < 0 || ny > 9) continue;
    if (tiles[ny]?.[nx] === 'wall') continue;
    if (occupied.has(`${nx},${ny}`)) continue;
    return dir;
  }
  return null;
}

export function decideBotAction(
  bot: MatchPlayer,
  allPlayers: MatchPlayer[],
  tiles: TileType[][] = DEFAULT_TILE_MAP,
): BotDecision {
  const { positionX: bx, positionY: by } = bot;
  const currentTile = tiles[by]?.[bx];

  const enemies = allPlayers.filter(
    (p) => p.alive && p.playerId !== bot.playerId
  );

  // 1. Collect — standing on a resource node
  if (currentTile === 'resource_node') {
    return { actionType: 'collect', payload: {} };
  }

  // Find adjacent enemies (Chebyshev ≤ 1)
  const adjacentEnemies = enemies.filter((e) => chebyshev(bx, by, e.positionX, e.positionY) <= 1);

  // 2. Defend — low HP and enemy nearby
  if (bot.hp < 30 && adjacentEnemies.length > 0) {
    return { actionType: 'defend', payload: {} };
  }

  // 3. Attack — pick lowest HP adjacent enemy
  if (adjacentEnemies.length > 0) {
    const target = adjacentEnemies.reduce((a, b) => (a.hp <= b.hp ? a : b));
    return { actionType: 'attack', payload: { targetId: target.playerId } };
  }

  // 4. Move — toward nearest resource_node, else toward nearest enemy
  const occupied = new Set(
    allPlayers
      .filter((p) => p.alive && p.playerId !== bot.playerId)
      .map((p) => `${p.positionX},${p.positionY}`),
  );

  // Find nearest resource_node on the tile map
  let bestTarget: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if (tiles[row]?.[col] === 'resource_node') {
        const dist = chebyshev(bx, by, col, row);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = { x: col, y: row };
        }
      }
    }
  }

  // Fall back to nearest living enemy
  if (!bestTarget && enemies.length > 0) {
    const nearest = enemies.reduce((a, b) =>
      chebyshev(bx, by, a.positionX, a.positionY) <=
      chebyshev(bx, by, b.positionX, b.positionY)
        ? a
        : b,
    );
    bestTarget = { x: nearest.positionX, y: nearest.positionY };
  }

  if (bestTarget) {
    const dir = greedyStep(bx, by, bestTarget.x, bestTarget.y, tiles, occupied);
    if (dir) {
      return { actionType: 'move', payload: { direction: dir } };
    }
  }

  // No viable move — defend as a safe no-op
  return { actionType: 'defend', payload: {} };
}
