export interface AtlasItem { id: string; sourceRect: [number, number, number, number]; anchor: [number, number] }
export interface Atlas { sheets: { file: string; items: AtlasItem[] }[] }
export interface SceneryProp { id: string; x: number; y: number; width: number; flip?: boolean; foot?: { w: number; h: number } }
export interface PropPlacement {
  scale: number; originX: number; originY: number; depth: number;
  footprint: { x: number; y: number; w: number; h: number } | null;
}
export interface Perspective { far: { y: number; scale: number }; near: { y: number; scale: number } }

export function atlasItem(atlas: Atlas, file: string, id: string): AtlasItem | undefined {
  return atlas.sheets.find(s => s.file === file)?.items.find(i => i.id === id);
}

export function placeProp(item: AtlasItem, prop: SceneryProp, scale = 1): PropPlacement {
  const [, , w, h] = item.sourceRect;
  const foot = prop.foot;
  return {
    scale: (prop.width * scale) / w,
    originX: item.anchor[0] / w,
    originY: item.anchor[1] / h,
    depth: prop.y,
    footprint: foot
      ? { x: prop.x - (foot.w * scale) / 2, y: prop.y - foot.h * scale, w: foot.w * scale, h: foot.h * scale }
      : null,
  };
}

export function depthScale(p: Perspective | undefined, y: number): number {
  if (!p) return 1;
  const span = p.near.y - p.far.y;
  if (!(span > 0) || !Number.isFinite(y)) return p.near.scale;
  const t = Math.min(1, Math.max(0, (y - p.far.y) / span));
  return p.far.scale + (p.near.scale - p.far.scale) * t;
}
