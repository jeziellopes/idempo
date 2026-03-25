/**
 * Shared arena tile map and client-side movement helpers.
 * Must stay in sync with the server-side DEFAULT_TILE_MAP in bot.strategy.ts.
 */

export type TileType = 'empty' | 'resource_node' | 'wall';

export type Direction = 'north' | 'south' | 'east' | 'west';

/** 10×10 map — matches GAME.md §2.2 and server-side DEFAULT_TILE_MAP */
export const ARENA_TILES: TileType[][] = [
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

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  north: { dx:  0, dy: -1 },
  south: { dx:  0, dy:  1 },
  east:  { dx:  1, dy:  0 },
  west:  { dx: -1, dy:  0 },
};

/**
 * Applies one movement step to a grid position, respecting arena bounds and walls.
 * Returns the new position (unchanged if the move is blocked).
 */
export function applyMoveLocally(
  pos: { x: number; y: number },
  direction: Direction,
): { x: number; y: number } {
  const { dx, dy } = DELTA[direction];
  const nx = Math.max(0, Math.min(9, pos.x + dx));
  const ny = Math.max(0, Math.min(9, pos.y + dy));
  if (ARENA_TILES[ny]?.[nx] === 'wall') return pos;
  return { x: nx, y: ny };
}
