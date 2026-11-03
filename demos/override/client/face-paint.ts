// Pure pixel work for the roundtable faces. No Phaser, no DOM.
// A blink or a closed mouth is painted from the same body drawing it covers, so it always registers:
// the eye or mouth pixels are filled from the face around them and a short lid or lip line is drawn on top.

/** Half-open rectangle [x0, y0, x1, y1) in frame pixels. */
export type Box = readonly [number, number, number, number];
export type Rgb = readonly [number, number, number];

/** An RGBA frame: `data` holds width * height * 4 bytes, row by row. */
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

/** Pixels this far from the face colour are eye or mouth; their 1 px neighbours join when over the lower bound (anti-aliased edges). */
const EYE_FAR = 48, EYE_NEAR = 22;
const MOUTH_FAR = 34, MOUTH_NEAR = 16;
const OPAQUE = 128;

const at = (p: Pixels, x: number, y: number) => (y * p.width + x) * 4;
const inside = (p: Pixels, x: number, y: number) => x >= 0 && y >= 0 && x < p.width && y < p.height;

function distance(p: Pixels, x: number, y: number, ref: Rgb): number {
  const i = at(p, x, y);
  const dr = p.data[i]! - ref[0], dg = p.data[i + 1]! - ref[1], db = p.data[i + 2]! - ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function medianColour(p: Pixels, points: [number, number][]): Rgb | null {
  if (!points.length) return null;
  const r: number[] = [], g: number[] = [], b: number[] = [];
  for (const [x, y] of points) { const i = at(p, x, y); r.push(p.data[i]!); g.push(p.data[i + 1]!); b.push(p.data[i + 2]!); }
  return [Math.round(median(r)), Math.round(median(g)), Math.round(median(b))];
}

/** Skin inside `box` (outside `exclude`): opaque, luma 95 or more and saturated (an eye white, a pupil or a lash never counts). */
export function skinIn(p: Pixels, box: Box, exclude?: Box): Rgb | null {
  const points: [number, number][] = [];
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
    if (!inside(p, x, y)) continue;
    if (exclude && x >= exclude[0] && x < exclude[2] && y >= exclude[1] && y < exclude[3]) continue;
    const i = at(p, x, y);
    const r = p.data[i]!, g = p.data[i + 1]!, b = p.data[i + 2]!, a = p.data[i + 3]!;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (a > 200 && luma >= 95 && Math.max(r, g, b) - Math.min(r, g, b) > 40) points.push([x, y]);
  }
  return medianColour(p, points);
}

/** Pixels of `box` that differ from `ref`: a core over `far`, grown by 1 px into neighbours over `near`. Sorted by row, then column. */
export function maskIn(p: Pixels, box: Box, ref: Rgb, far: number, near: number): [number, number][] {
  const key = (x: number, y: number) => y * p.width + x;
  const ok = (x: number, y: number) => x >= box[0] && y >= box[1] && x < box[2] && y < box[3] && inside(p, x, y) && p.data[at(p, x, y) + 3]! > OPAQUE;
  const core: [number, number][] = [];
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) if (ok(x, y) && distance(p, x, y, ref) > far) core.push([x, y]);
  const out = new Map<number, [number, number]>();
  for (const [x, y] of core) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (ok(nx, ny) && !out.has(key(nx, ny)) && (dx === 0 && dy === 0 ? true : distance(p, nx, ny, ref) > near)) out.set(key(nx, ny), [nx, ny]);
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
}

/** A transparent frame the size of `p`; only painted pixels become opaque. */
const blank = (p: Pixels): Pixels => ({ data: new Uint8ClampedArray(p.width * p.height * 4), width: p.width, height: p.height });

function put(out: Pixels, x: number, y: number, rgb: Rgb) {
  if (!inside(out, x, y)) return;
  const i = at(out, x, y);
  out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2]; out.data[i + 3] = 255;
}

/**
 * Closed eyes for one body drawing: an overlay (transparent outside the painted pixels).
 * Inside each eye window, the eye white, iris, pupil and upper lash become the skin around them;
 * then a lid line, 2 px in the middle and 1 px raised at the ends, crosses where the eye was.
 * A window placed inside a lens keeps the rims of the glasses. `skinFrom[i]`, when given, is where eye i's fill colour
 * is sampled instead, outside the window (a lens interior: the window itself holds mostly eye and its shading).
 */
export function paintBlink(p: Pixels, eyes: readonly Box[], lash: Rgb, skinFrom: readonly Box[] = []): Pixels {
  const out = blank(p);
  for (const [i, box] of eyes.entries()) {
    const from = skinFrom[i];
    const skin = from ? skinIn(p, from, box) : skinIn(p, box);
    if (!skin) continue;
    const mask = maskIn(p, box, skin, EYE_FAR, EYE_NEAR);
    if (!mask.length) continue;
    for (const [x, y] of mask) put(out, x, y, skin);
    let x0 = Infinity, x1 = -Infinity, top = Infinity, bottom = -Infinity;
    for (const [x, y] of mask) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const row = bottom - Math.round((bottom - top) * 0.38);
    const width = Math.max(1, x1 - x0);
    for (let x = x0; x <= x1; x++) {
      const t = ((x - x0) / width) * 2 - 1;
      const y = row + (Math.abs(t) < 0.55 ? 0 : -1);
      put(out, x, y, lash);
      if (Math.abs(t) < 0.75) put(out, x, y + 1, lash);
    }
  }
  return out;
}

/**
 * A closed mouth for a talking body drawing: an overlay. The open mouth (pixels unlike the ring around `box`)
 * is filled column by column from the face just above and below it, and a 1 px lip line is drawn across its middle.
 * Works inside a beard: the ring, and so the fill, is the beard.
 */
export function paintClosedMouth(p: Pixels, box: Box, lip: Rgb): Pixels {
  const out = blank(p);
  const [x0, y0, x1, y1] = box;
  const ring: [number, number][] = [];
  for (let x = x0 - 1; x <= x1; x++) { if (inside(p, x, y0 - 1)) ring.push([x, y0 - 1]); if (inside(p, x, y1)) ring.push([x, y1]); }
  for (let y = y0; y < y1; y++) { if (inside(p, x0 - 1, y)) ring.push([x0 - 1, y]); if (inside(p, x1, y)) ring.push([x1, y]); }
  const ref = medianColour(p, ring);
  if (!ref) return out;
  const mask = maskIn(p, box, ref, MOUTH_FAR, MOUTH_NEAR);
  if (!mask.length) return out;
  const masked = new Set(mask.map(([x, y]) => y * p.width + x));
  const free = (x: number, y: number) => inside(p, x, y) && !masked.has(y * p.width + x);
  for (const [x, y] of mask) {
    let up = y - 1; while (up > y0 - 4 && !free(x, up)) up--;
    let down = y + 1; while (down < y1 + 3 && !free(x, down)) down++;
    if (!free(x, up)) up = y0 - 1;
    if (!free(x, down)) down = y1;
    const t = (y - up) / (down - up);
    const a = at(p, x, up), b = at(p, x, down);
    const mix = (c: number) => Math.round(p.data[a + c]! * (1 - t) + p.data[b + c]! * t);
    put(out, x, y, [mix(0), mix(1), mix(2)]);
  }
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const [x, y] of mask) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const row = Math.round((top + bottom) / 2);
  for (let x = left + 1; x < right; x++) put(out, x, row, lip);
  return out;
}

/** Draw `overlay` onto a copy of `base` (overlay pixels with alpha replace the base pixel). */
export function applyOverlay(base: Pixels, overlay: Pixels): Pixels {
  const data = new Uint8ClampedArray(base.data);
  for (let i = 0; i < data.length; i += 4) {
    if (overlay.data[i + 3]! === 0) continue;
    data[i] = overlay.data[i]!; data[i + 1] = overlay.data[i + 1]!; data[i + 2] = overlay.data[i + 2]!; data[i + 3] = 255;
  }
  return { data, width: base.width, height: base.height };
}

/** Bounds of the opaque pixels in rows [fromRow, toRow): [x0, y0, x1, y1) or null when empty. */
export function opaqueBounds(p: Pixels, fromRow = 0, toRow = p.height): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = Math.max(0, fromRow); y < Math.min(p.height, toRow); y++) for (let x = 0; x < p.width; x++) {
    if (p.data[at(p, x, y) + 3]! > OPAQUE) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
