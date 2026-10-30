export type Frame = { x: number; y: number; w: number; h: number; anchorX: number; anchorY: number };

// Longest run of lines with the fewest opaque pixels near the even split; returns the first line of the next cell.
function cutAt(counts: Int32Array, e: number, cell: number): number {
  const half = Math.floor(cell / 3);
  const lo = Math.max(0, e - half);
  const hi = Math.min(counts.length - 1, e + half);
  let min = Infinity;
  for (let i = lo; i <= hi; i++) if (counts[i] < min) min = counts[i];
  let bestS = lo, bestE = lo, bestLen = -1, bestDist = Infinity;
  let i = lo;
  while (i <= hi) {
    if (counts[i] !== min) { i++; continue; }
    const s = i;
    while (i + 1 <= hi && counts[i + 1] === min) i++;
    const len = i - s + 1;
    const dist = Math.abs((s + i) / 2 - e);
    if (len > bestLen || (len === bestLen && dist < bestDist)) { bestS = s; bestE = i; bestLen = len; bestDist = dist; }
    i++;
  }
  return Math.floor((bestS + bestE + 1) / 2);
}

export function sliceAtlas(alpha: ArrayLike<number>, width: number, height: number, cols: number, rows: number, threshold = 16): Frame[] {
  const colN = new Int32Array(width);
  const rowN = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const o = y * width;
    let n = 0;
    for (let x = 0; x < width; x++) if (alpha[o + x] > threshold) { colN[x]++; n++; }
    rowN[y] = n;
  }
  const xs = [0];
  for (let k = 1; k < cols; k++) xs.push(cutAt(colN, Math.round((k * width) / cols), width / cols));
  xs.push(width);
  const ys = [0];
  for (let k = 1; k < rows; k++) ys.push(cutAt(rowN, Math.round((k * height) / rows), height / rows));
  ys.push(height);

  const out: Frame[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = xs[c], x1 = xs[c + 1], y0 = ys[r], y1 = ys[r + 1];
      let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
      for (let y = y0; y < y1; y++) {
        const o = y * width;
        for (let x = x0; x < x1; x++) {
          if (alpha[o + x] > threshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      // Trim edges holding fewer than 2 opaque pixels inside the box (stray pixels, thin shadows, bridges).
      const lineN = (vertical: boolean, k: number): number => {
        let n = 0;
        if (vertical) { for (let y = minY; y <= maxY; y++) if (alpha[y * width + k] > threshold) n++; }
        else { const o = k * width; for (let x = minX; x <= maxX; x++) if (alpha[o + x] > threshold) n++; }
        return n;
      };
      let moved = maxX >= 0;
      while (moved && minX <= maxX && minY <= maxY) {
        moved = false;
        if (lineN(true, minX) < 2) { minX++; moved = true; }
        else if (lineN(true, maxX) < 2) { maxX--; moved = true; }
        else if (lineN(false, minY) < 2) { minY++; moved = true; }
        else if (lineN(false, maxY) < 2) { maxY--; moved = true; }
      }
      if (maxX < minX || maxY < minY) maxX = -1;
      if (maxX < 0) {
        out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, anchorX: (x1 - x0) / 2, anchorY: y1 - y0 });
        continue;
      }
      const h = maxY - minY + 1;
      const headRows = Math.max(1, Math.round(0.4 * h));
      let hx0 = Infinity, hx1 = -1;
      for (let y = minY; y < minY + headRows; y++) {
        const o = y * width;
        for (let x = minX; x <= maxX; x++) {
          if (alpha[o + x] > threshold) {
            if (x < hx0) hx0 = x;
            if (x > hx1) hx1 = x;
          }
        }
      }
      if (hx1 < 0) { hx0 = minX; hx1 = maxX; }
      out.push({ x: minX, y: minY, w: maxX - minX + 1, h, anchorX: (hx0 + hx1 + 1) / 2 - minX, anchorY: h });
    }
  }
  return out;
}
