export const BUBBLE_WIDTH = 140;
const GAME_WIDTH = 480;
const MARGIN = 4;
/** Half the name label's box (7px font + 3px padding each side = 13px, centred on its anchor), the bubble tail's reach below
 *  the bubble (about 6px) and a 2px gap: the tail tip stays clear of the label. */
export const LABEL_CLEARANCE = 7 + 6 + 2;

/**
 * Where a speech bubble sits for a name label centred at (x, y) in game pixels. The bubble's bottom edge is pinned at `bottom`
 * (= y - LABEL_CLEARANCE, so it and its tail clear the label) and it grows upward to fit its text, up to `maxHeight`, so it never leaves the scene. `top` is the legacy 78px box top.
 */
export function placeBubble(x: number, y: number, width: number): { left: number; top: number; bottom: number; maxHeight: number; tail: number } {
  const left = Math.max(MARGIN, Math.min(GAME_WIDTH - MARGIN - width, x - width / 2));
  const bottom = y - LABEL_CLEARANCE;
  return { left, top: bottom - 80, bottom, maxHeight: Math.max(0, bottom - MARGIN), tail: x - left };
}
