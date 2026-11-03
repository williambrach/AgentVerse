// Temporary seated rig for Sam, composed at runtime from existing art. Pure pixel work: no Phaser, no DOM.
// Sam has only standing drawings. His head, sweater and arms (down to the sweater hem) come from his own
// drawing for the state; the lap, legs and feet are the player's seated idle drawing, recoloured to Sam's
// tan trousers, brown shoes and skin. It is not a drawn seated Sam and must not be described as one.
import type { Pixels } from './face-paint.ts';

/** Sam's rows [0, samRow) of the state drawing, moved by (dx, dy) so the head lands where the idle rig has it. */
export interface SamPart { samRow: number; dx: number; dy: number }

export const SAM_RIG = {
  /** The player's seated rows from here down: thighs below the hands, shins, shoes. */
  legRow: 196,
  /** Legs shift right so the knees reach forward of Sam's torso (the rig is drawn facing right, then mirrored). */
  legDx: 10,
  /** The player's hoodie hangs over the seat left of this column, above flapRow: left out. */
  legLeft: 44, flapRow: 216,
  /** From this row the player's sneakers become Sam's shoes. */
  shoeRow: 243,
  /** Sam's hem (row 165) sits on the thighs: his drawing moves down 33 rows; the per-state dx matches the head registration. */
  parts: {
    idle: { samRow: 166, dx: 0, dy: 33 },
    talk: { samRow: 166, dx: 12, dy: 33 },
    think: { samRow: 166, dx: 6, dy: 32 },
  } as Record<'idle' | 'talk' | 'think', SamPart>,
  outline: [22, 14, 12] as const,
};

type Hsl = [number, number, number];

function toHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const ramp = (v: number, a0: number, a1: number, b0: number, b1: number) => b0 + Math.min(1, Math.max(0, (v - a0) / (a1 - a0))) * (b1 - b0);

/**
 * One pixel of the player's seated legs in Sam's colours. Lightness ramps keep the original shading.
 * Outlines (lightness under 0.09) keep their colour; anything else unrecognised is left as it is.
 */
export function samLegColour(r: number, g: number, b: number, row: number, shoeRow = SAM_RIG.shoeRow): [number, number, number] {
  const [h, s, l] = toHsl(r, g, b);
  if (l < 0.09) return [r, g, b];
  if (row >= shoeRow) return toRgb(19, 0.5, ramp(l, 0.13, 0.89, 0.10, 0.34));         // sneakers -> brown shoes
  if ((h >= 195 && h <= 260 && s > 0.04) || s < 0.12) return toRgb(29, 0.39, ramp(l, 0.10, 0.48, 0.20, 0.53)); // jeans -> tan trousers
  if (h >= 15 && h <= 38 && s > 0.35 && l > 0.4) return toRgb(26, 0.47, ramp(l, 0.55, 0.78, 0.36, 0.50));       // skin
  return [r, g, b];
}

const OPAQUE = 128;

/**
 * Sam seated, facing right like the source drawings (the scene mirrors it): the player's recoloured legs,
 * then Sam's state drawing above its hem, then an outline where the knee was cut and Sam's hem does not cover it.
 */
export function composeSeatedSam(sam: Pixels, legs: Pixels, part: SamPart, rig = SAM_RIG): Pixels {
  const { width, height } = sam;
  const data = new Uint8ClampedArray(width * height * 4);
  const out: Pixels = { data, width, height };
  const idx = (x: number, y: number) => (y * width + x) * 4;
  const fromSam = new Uint8Array(width * height);
  for (let y = rig.legRow; y < Math.min(height, legs.height); y++) {
    for (let x = 0; x < legs.width; x++) {
      if (x < rig.legLeft && y < rig.flapRow) continue;
      const s = (y * legs.width + x) * 4;
      if (legs.data[s + 3]! === 0) continue;
      const tx = x + rig.legDx;
      if (tx < 0 || tx >= width) continue;
      const [r, g, b] = samLegColour(legs.data[s]!, legs.data[s + 1]!, legs.data[s + 2]!, y, rig.shoeRow);
      const t = idx(tx, y);
      data[t] = r; data[t + 1] = g; data[t + 2] = b; data[t + 3] = legs.data[s + 3]!;
    }
  }
  // Columns where the cut row is a real edge of the legs (opaque three rows down too, so not a stray fingertip).
  const cut = rig.legRow;
  const edge: number[] = [];
  for (let x = 0; x < width; x++) if (data[idx(x, cut) + 3]! > OPAQUE && cut + 3 < height && data[idx(x, cut + 3) + 3]! > OPAQUE) edge.push(x);
  for (let y = 0; y < Math.min(part.samRow, sam.height); y++) {
    for (let x = 0; x < sam.width; x++) {
      const s = (y * sam.width + x) * 4;
      if (sam.data[s + 3]! === 0) continue;
      const tx = x + part.dx, ty = y + part.dy;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      const t = idx(tx, ty);
      data[t] = sam.data[s]!; data[t + 1] = sam.data[s + 1]!; data[t + 2] = sam.data[s + 2]!; data[t + 3] = sam.data[s + 3]!;
      fromSam[ty * width + tx] = 1;
    }
  }
  // Close the cut where it shows: the hem covers neither the cut row nor the row above it.
  const exposed = new Set(edge.filter(x => !fromSam[cut * width + x] && !fromSam[(cut - 1) * width + x] && data[idx(x, cut - 1) + 3]! < OPAQUE));
  const paint = (x: number, y: number) => { const t = idx(x, y); data[t] = rig.outline[0]; data[t + 1] = rig.outline[1]; data[t + 2] = rig.outline[2]; data[t + 3] = 255; };
  for (const x of exposed) {
    const runEnd = !exposed.has(x - 1) || !exposed.has(x + 1);
    paint(x, cut);
    if (runEnd && data[idx(x, cut + 1) + 3]! > OPAQUE) paint(x, cut + 1);
  }
  // Round the front corner of each exposed run (the knee).
  for (const x of exposed) {
    if (exposed.has(x + 1)) continue;
    const t = idx(x, cut), below = idx(x, cut + 1);
    data[t] = data[below]!; data[t + 1] = data[below + 1]!; data[t + 2] = data[below + 2]!; data[t + 3] = data[below + 3]!;
  }
  return out;
}
