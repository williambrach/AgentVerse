export interface LabelBox { id: string; x: number; y: number; w: number; h: number }
export interface LabelState { near: string | null; hovered: string | null; active: string | null }

export function labelEmphasis(id: string, s: LabelState): 'strong' | 'subtle' {
  return s.near === id || s.hovered === id || s.active === id ? 'strong' : 'subtle';
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : (lo + hi) / 2)));

export function layoutLabels(
  boxes: LabelBox[], bounds: { w: number; h: number }, pad = 2,
): Record<string, { x: number; y: number }> {
  const placed = boxes.map(b => ({
    id: b.id, w: b.w, h: b.h,
    x: clamp(b.x, pad + b.w / 2, bounds.w - pad - b.w / 2),
    y: clamp(b.y, pad + b.h / 2, bounds.h - pad - b.h / 2),
  }));
  const hit = (a: typeof placed[0], o: typeof placed[0]) =>
    Math.abs(a.x - o.x) < (a.w + o.w) / 2 + pad && Math.abs(a.y - o.y) < (a.h + o.h) / 2 + pad;
  for (let pass = 0; pass < 20; pass++) {
    let moved = false;
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i];
      for (let j = 0; j < i; j++) {
        const o = placed[j];
        if (!hit(a, o)) continue;
        const gap = (a.h + o.h) / 2 + pad;
        let y = o.y - gap;
        if (y < pad + a.h / 2) y = o.y + gap;
        a.y = clamp(y, pad + a.h / 2, bounds.h - pad - a.h / 2);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (const p of placed) out[p.id] = { x: p.x, y: p.y };
  return out;
}
