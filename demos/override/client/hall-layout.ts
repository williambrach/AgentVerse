export type Rect = { x: number; y: number; w: number; h: number };
export type Walk = { bounds: Rect; blocks: Rect[] };
export type EvidenceMark = { id: string; title: string; examined: boolean };

const inside = (r: Rect, p: { x: number; y: number }): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** True when the point is inside the walk bounds and outside every block. */
export function inWalk(walk: Walk, p: { x: number; y: number }): boolean {
  if (!inside(walk.bounds, p)) return false;
  return !walk.blocks.some(b => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h);
}

export const evidenceKey = (id: string): string => 'evidence:' + id;

/** 'evidence:usb-drive' -> 'usb-drive'; anything else -> null. */
export function evidenceIdOf(location: string): string | null {
  if (typeof location !== 'string' || !location.startsWith('evidence:')) return null;
  const id = location.slice('evidence:'.length);
  return id === '' ? null : id;
}
