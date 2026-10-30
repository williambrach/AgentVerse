// Shared helpers for the admin modules. Text only, through textContent; no markup is ever parsed.
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const num = (v, fallback = 0) => (isNum(v) ? v : fallback);
export const pad2 = (n) => String(n).padStart(2, '0');

/** Milliseconds as m:ss (minutes unpadded). */
export function mmss(ms) {
  const s = Math.max(0, Math.round(num(ms) / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** Create an element; text goes in through textContent only. */
export function el(doc, tag, cls, opts = {}) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (opts.text !== undefined) e.textContent = opts.text;
  if (opts.parent) opts.parent.appendChild(e);
  return e;
}
