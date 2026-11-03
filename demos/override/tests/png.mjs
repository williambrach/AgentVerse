// Minimal PNG reader for tests: 8-bit RGBA, non-interlaced (the friends strips). Node built-ins only.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPng(path) {
  const buf = readFileSync(path);
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error(`${path}: only 8-bit RGBA non-interlaced`);
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[y * stride + x - 4] : 0, b = y > 0 ? data[(y - 1) * stride + x] : 0, c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      data[y * stride + x] = (raw[line + x] + pred) & 255;
    }
  }
  return { data, width, height };
}

/** One 192x288 frame of a strip. */
export function stripFrame(png, index, w = 192, h = 288) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(png.data.subarray((y * png.width + index * w) * 4, (y * png.width + index * w + w) * 4), y * w * 4);
  return { data, width: w, height: h };
}

const cache = new Map();
/** A frame of public/assets/friends/<image>. */
export function friendsFrame(image, index = 0) {
  if (!cache.has(image)) cache.set(image, readPng(new URL(`../public/assets/friends/${image}`, import.meta.url)));
  return stripFrame(cache.get(image), index);
}
