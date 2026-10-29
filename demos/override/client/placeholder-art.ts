export interface RgbaAtlas { width: number; height: number; cols: number; rows: number; data: Uint8ClampedArray }
type Kind = 'cast' | 'idle' | 'walk' | 'props';
type Rgb = [number, number, number];

const CELL = 64;
const BASE = 59; // lowest opaque cell row
const SKIN: Rgb = [0xf1, 0xc9, 0xa5];
const NAVY = '#2c3e66';
const EYE: Rgb = [0x22, 0x22, 0x33];
const DIMS: Record<Kind, [number, number]> = { cast: [4, 4], idle: [4, 3], walk: [4, 4], props: [2, 2] };

const parse = (hex: string): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const darker = ([r, g, b]: Rgb): Rgb => [Math.round(r * 0.65), Math.round(g * 0.65), Math.round(b * 0.65)];

export function placeholderAtlas(kind: 'cast' | 'idle' | 'walk' | 'props', colors: string[]): RgbaAtlas {
  const [cols, rows] = DIMS[kind];
  const width = cols * CELL, height = rows * CELL;
  const data = new Uint8ClampedArray(width * height * 4);
  const palette = (i: number) => parse(colors[i] ?? '#888888');

  const rect = (cx: number, cy: number, x: number, y: number, w: number, h: number, [r, g, b]: Rgb) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const i = ((cy * CELL + yy) * width + cx * CELL + xx) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  };

  // dir: 0 down, 1 up, 2 left, 3 right; arm: 0 none, 1 half, 2 up; legs: 0 together, 1 apart
  const figure = (cx: number, cy: number, color: Rgb, dir: number, blink: boolean, arm: number, legs: number) => {
    const hem = darker(color);
    rect(cx, cy, 20, 30, 24, 24, color); // robe 20..43 x 30..53
    rect(cx, cy, 20, 50, 24, 4, hem); // hem
    if (legs) { rect(cx, cy, 20, 54, 7, 6, hem); rect(cx, cy, 37, 54, 7, 6, hem); } // feet apart, bottom row 59
    else rect(cx, cy, 24, 54, 16, 6, hem);
    rect(cx, cy, 24, 16, 16, 14, SKIN); // head 16..29
    rect(cx, cy, 22, 12, 20, 5, hem); // hat brim
    rect(cx, cy, 26, 7, 12, 5, hem);
    rect(cx, cy, 30, 4, 5, 3, hem);
    if (dir !== 1 && !blink) {
      const ex = dir === 0 ? [27, 35] : dir === 2 ? [25, 30] : [34, 39];
      for (const x of ex) rect(cx, cy, x, 22, 2, 2, EYE);
    }
    if (arm === 1) rect(cx, cy, 44, 34, 6, 4, SKIN);
    if (arm === 2) { rect(cx, cy, 44, 24, 5, 14, color); rect(cx, cy, 44, 20, 5, 5, SKIN); }
  };

  const prop = (cx: number, cy: number, i: number) => {
    const wood: Rgb = [0x7a, 0x55, 0x33], dark: Rgb = [0x4a, 0x33, 0x20], gold: Rgb = [0xe0, 0xb8, 0x40];
    if (i === 0) { // bookshelf
      rect(cx, cy, 10, 8, 44, 52, wood);
      for (let s = 0; s < 3; s++) {
        rect(cx, cy, 13, 12 + s * 16, 38, 12, dark);
        for (let b = 0; b < 6; b++) rect(cx, cy, 14 + b * 6, 14 + s * 16, 4, 10, [[0xb0, 0x40, 0x40], [0x40, 0x70, 0xb0], [0x50, 0x90, 0x50]][(b + s) % 3] as Rgb);
      }
    } else if (i === 1) { // potion cabinet
      rect(cx, cy, 12, 8, 40, 52, wood);
      rect(cx, cy, 16, 12, 32, 44, dark);
      for (let s = 0; s < 3; s++) for (let b = 0; b < 3; b++) rect(cx, cy, 20 + b * 10, 18 + s * 13, 6, 8, [[0xc0, 0x50, 0xa0], [0x50, 0xb0, 0xc0], [0x90, 0xd0, 0x50]][(b + s) % 3] as Rgb);
    } else if (i === 2) { // noticeboard
      rect(cx, cy, 8, 10, 48, 36, wood);
      rect(cx, cy, 12, 14, 40, 28, [0xc8, 0xa8, 0x78]);
      rect(cx, cy, 16, 18, 12, 10, [0xff, 0xff, 0xf0]);
      rect(cx, cy, 34, 22, 14, 12, [0xff, 0xff, 0xf0]);
      rect(cx, cy, 28, 46, 8, 14, wood);
    } else { // bell
      rect(cx, cy, 30, 8, 4, 6, dark);
      rect(cx, cy, 22, 14, 20, 24, gold);
      rect(cx, cy, 16, 38, 32, 8, gold);
      rect(cx, cy, 28, 46, 8, 6, dark);
      rect(cx, cy, 20, 54, 24, 6, wood);
    }
  };

  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (kind === 'props') prop(c, r, r * cols + c);
    else if (kind === 'cast') figure(c, r, c < 3 ? palette(c) : parse(NAVY), r, false, 0, 0);
    else if (kind === 'idle') figure(c, r, palette(r), 0, c === 1, c === 2 ? 1 : c === 3 ? 2 : 0, 0);
    else figure(c, r, parse(NAVY), r, false, 0, c === 1 || c === 3 ? 1 : 0);
  }
  return { width, height, cols, rows, data };
}
