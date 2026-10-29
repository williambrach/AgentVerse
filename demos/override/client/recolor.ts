/** Recolour art drawn for one character so another can wear it. Pure pixel maths, no DOM. */

type Hsl = { h: number; s: number; l: number };

const HEX = /^#?([0-9a-f]{6})$/i;
/** Saturation below this is an outline, shadow or highlight and keeps its colour. */
const MIN_SATURATION = 0.15;
/** How far the target's saturation and lightness may pull a pixel, as a ratio of the source colour's. */
const MIN_RATIO = 0.5;
const MAX_RATIO = 2;

function parseHex(color: string): [number, number, number] | null {
  const m = HEX.exec(color.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function toRgb({ h, s, l }: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ratio = (to: number, from: number) => (from > 0 ? clamp(to / from, MIN_RATIO, MAX_RATIO) : 1);

/**
 * Move art drawn in `fromColor` towards `toColor`: every saturated pixel has its hue rotated by the gap
 * between the two colours, and its saturation and lightness scaled by their ratio (a hue turn alone
 * leaves a fawn monkey and a tan one hard to tell apart). Pixels under 0.15 saturation and the alpha
 * channel are untouched. Returns a new array; the input is not modified.
 */
export function hueShift(data: Uint8ClampedArray, fromColor: string, toColor: string): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const a = parseHex(fromColor), b = parseHex(toColor);
  if (!a || !b) return out;
  const from = toHsl(...a), to = toHsl(...b);
  const turn = to.h - from.h;
  const sRatio = ratio(to.s, from.s), lRatio = ratio(to.l, from.l);
  for (let i = 0; i + 3 < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const px = toHsl(out[i]!, out[i + 1]!, out[i + 2]!);
    if (px.s < MIN_SATURATION) continue;
    const [r, g, bl] = toRgb({
      h: (((px.h + turn) % 360) + 360) % 360,
      s: clamp(px.s * sRatio, 0, 1),
      l: clamp(px.l * lRatio, 0, 1),
    });
    out[i] = r; out[i + 1] = g; out[i + 2] = bl;
  }
  return out;
}

/** The sheets draw three cast characters; a character at index i >= SHEET_CAST wears index i - SHEET_CAST, recoloured. */
export const SHEET_CAST = 3;

export interface FaceSheetStep {
  index: number;
  /** CSS custom property that holds the recoloured sheet for this world and index. */
  name: string;
  /** Changes whenever the world or either colour changes; null when the cast has no such character. */
  key: string | null;
  from: string;
  to: string;
}

/** CSS variable for the recoloured cast sheet of persona `index` in `worldId`; each world has its own, so another world's preview never reads this world's sheet. */
export const faceSheetVar = (worldId: string, index: number) => `--face-sheet-${worldId}-${index}`;

/** What to publish for a world's cast: one step per index from SHEET_CAST up to `slots`. Pure over world and cast colours. */
export function faceSheetPlan(worldId: string, cast: { color: string }[], slots: number): FaceSheetStep[] {
  const steps: FaceSheetStep[] = [];
  for (let index = SHEET_CAST; index < slots; index++) {
    const base = cast[index - SHEET_CAST], own = cast[index];
    steps.push({
      index, name: faceSheetVar(worldId, index),
      key: base && own ? `${worldId}|${base.color}|${own.color}` : null,
      from: base?.color ?? '', to: own?.color ?? '',
    });
  }
  return steps;
}
