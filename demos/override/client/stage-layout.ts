// Pure maths for the stage: the Phaser game is larger than the 480x340 world, which sits inside it at (offsetX, offsetY).
export const WORLD_WIDTH = 480;
export const WORLD_HEIGHT = 340;
export const RAIL = 252;
export const COMPACT_QUERY = '(max-width: 900px), (max-height: 599px)';

export interface StageLayout { width: number; height: number; offsetX: number; offsetY: number; scale: number }

/** The stage for a window: the world fills the height or the space right of the rail, whichever binds first.
 *  Only the world's left 32 px (outside the physics bounds) may sit under the rail. */
export function stageLayout(viewportWidth: number, viewportHeight: number, rail: number): StageLayout {
  const scale = Math.min(viewportHeight / WORLD_HEIGHT, (viewportWidth - rail) / (WORLD_WIDTH - 32));
  const width = Math.max(WORLD_WIDTH, Math.round(viewportWidth / scale));
  const height = Math.max(WORLD_HEIGHT, Math.round(viewportHeight / scale));
  const marginX = width - WORLD_WIDTH, marginY = height - WORLD_HEIGHT;
  const wanted = Math.max(Math.round(marginX / 2), Math.ceil(rail / scale - 1e-9) - 32);
  return { width, height, offsetX: Math.min(Math.max(wanted, 0), marginX), offsetY: Math.round(marginY / 2), scale };
}
