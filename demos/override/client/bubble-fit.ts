// Pure maths for a roundtable speech bubble, in room pixels (y grows downwards).
// A bubble shows whole lines only and never reaches above `top` (the HUD's lower edge);
// the full line is always in the thread.

/** Matches .roundtable-bubble in friends.css: 17 px text at line-height 1.3, 8 px padding and 2 px border top and bottom. */
export const BUBBLE = { lineHeight: 17 * 1.3, chrome: 8 * 2 + 2 * 2, narrow: 220, wide: 320, maxLines: 6 };

export interface BubbleFit { bottom: number; lines: number }

/**
 * Lines that fit between `top` and the anchor above the speaker's tag (`anchor`, the bubble's preferred bottom).
 * When not even one line fits there, the bubble moves down (over the tag) so that one line sits just under `top`.
 */
export function bubbleFit(top: number, anchor: number): BubbleFit {
  const fit = Math.floor((anchor - top - BUBBLE.chrome) / BUBBLE.lineHeight);
  const lines = Math.max(1, Math.min(BUBBLE.maxLines, fit));
  const bottom = Math.max(anchor, top + BUBBLE.chrome + lines * BUBBLE.lineHeight);
  return { bottom, lines };
}

/** The bubble's centre x: over the speaker, kept inside the room. */
export function bubbleX(seatX: number, width: number, roomWidth: number): number {
  return Math.max(width / 2, Math.min(roomWidth - width / 2, seatX));
}
