// Pure maths for the roundtable room: a logical 1280x720 room, the table, the six seats and the window fit.
import type { StageLayout } from './stage-layout.ts';

export const ROOM = { width: 1280, height: 720 };
/** Draw order, low to high: far chairs sit behind far actors, the table covers them, near chairs and actors go on top. */
export const DEPTH = { backdrop: 0, farChair: 10, far: 20, table: 30, nearChair: 40, near: 50 };

export interface Seat { actor: string; x: number; y: number; scale: number; layer: 'far' | 'near'; mirror: boolean; depth: number }
export interface TableBox { x: number; y: number; width: number; height: number; depth: number }

const TABLE_IMAGE = { width: 1672, height: 941 };
// Tabletop ellipse in sprite pixels of roundtable-fullscreen.png.
const TOP = { cx: 836, cy: 375, rx: 828, ry: 362 };

/** The room right of the rail at the largest scale that fits; the backdrop covers the rest of the window.
 *  Compact windows get the bare room scaled to the window width. */
export function fitRoom(viewW: number, viewH: number, rail: number, compact: boolean): StageLayout {
  if (!(viewW > 0) || !(viewH > 0)) { viewW = ROOM.width; viewH = ROOM.height; rail = 0; }
  if (!(rail >= 0) || rail >= viewW) rail = 0;
  if (compact) return { width: ROOM.width, height: ROOM.height, offsetX: 0, offsetY: 0, scale: viewW / ROOM.width };
  const scale = Math.min(viewH / ROOM.height, (viewW - rail) / ROOM.width);
  const width = Math.round(viewW / scale);
  const height = Math.round(viewH / scale);
  const railU = rail / scale;
  const offsetX = Math.max(0, Math.round(railU + (width - railU - ROOM.width) / 2));
  const offsetY = Math.max(0, Math.round((height - ROOM.height) / 2));
  return { width, height, offsetX, offsetY, scale };
}

export function table(): TableBox {
  return { x: 140, y: 250, width: 1000, height: 1000 * TABLE_IMAGE.height / TABLE_IMAGE.width, depth: DEPTH.table };
}

/** Start values: the friends' heads clear the top margin, far anchors sit inside the table image, near ones below the tabletop. */
export function seats(): Seat[] {
  const far = (actor: string, x: number, y: number, mirror: boolean): Seat => ({ actor, x, y, scale: 1, layer: 'far', mirror, depth: DEPTH.far });
  const near = (actor: string, x: number, y: number, mirror: boolean): Seat => ({ actor, x, y, scale: 1.15, layer: 'near', mirror, depth: DEPTH.near });
  return [
    far('maya', 330, 417, false),
    far('ken', 540, 405, false),
    { ...far('alex', 740, 440, true), scale: 1.18 },
    { ...far('nora', 950, 478, true), scale: 1.18 },
    { ...near('player', 225, 680, false), scale: 1.05 },
    // Sam's temporary seated rig (sam-rig.ts) keeps the player's foot row, so it stands on the same floor line.
    // Standing art draws smaller heads on bigger bodies: 1.2 keeps his head near the player's without a giant torso.
    { ...near('sam', 1055, 680, true), scale: 1.2 },
  ];
}

export interface ChairSpot { actor: string; image: 'chair-front' | 'chair-left' | 'chair-right'; x: number; y: number; width: number; depth: number }

/**
 * Chairs, bottom-centre anchored. Far chairs face us behind their friend, centred on the torso (not the frame),
 * so the back shows evenly at both shoulders; the table hides their seats. Near chairs stand sideways under the seat.
 */
export function chairs(): ChairSpot[] {
  const seat = Object.fromEntries(seats().map(s => [s.actor, s]));
  const far = (actor: string, dx: number, dy: number): ChairSpot => ({ actor, image: 'chair-front', x: seat[actor]!.x + dx, y: seat[actor]!.y + dy, width: 154, depth: DEPTH.farChair });
  return [
    far('maya', 0, 7),
    far('ken', 0, 7),
    // The standing drawings have taller torsos: their chairs rise so the backs still show above the shoulders.
    far('alex', 0, -40),
    far('nora', 0, -44),
    { actor: 'player', image: 'chair-left', x: seat.player!.x, y: 690, width: 190, depth: DEPTH.nearChair },
    // Sam's rig is the player's seated legs at his larger scale: his chair scales with it, so legs and seat still match.
    { actor: 'sam', image: 'chair-right', x: seat.sam!.x, y: 690, width: Math.round(190 * seat.sam!.scale / seat.player!.scale), depth: DEPTH.nearChair },
  ];
}

/** The tabletop ellipse in room pixels. */
export function tabletop(): { cx: number; cy: number; rx: number; ry: number } {
  const t = table(), k = t.width / TABLE_IMAGE.width;
  return { cx: t.x + TOP.cx * k, cy: t.y + TOP.cy * k, rx: TOP.rx * k, ry: TOP.ry * k };
}

/** How much the tabletop is foreshortened: a flat prop is this much shorter on screen than wide. */
export const TILT = TOP.ry / TOP.rx;

/** Room point of a point on the tabletop: u and v run -1..1 across the ellipse (v -1 is the far edge). */
export function tablePoint(u: number, v: number): { x: number; y: number } {
  const e = tabletop();
  return { x: e.cx + u * e.rx, y: e.cy + v * e.ry };
}

/** The far edge of the tabletop at room x: anything of a far actor below this line is behind the table. */
export function farEdge(x: number): number {
  const e = tabletop();
  const u = (x - e.cx) / e.rx;
  return Math.abs(u) >= 1 ? e.cy : e.cy - e.ry * Math.sqrt(1 - u * u);
}

/** True when a room point lies on the tabletop ellipse. */
export function onTabletop(x: number, y: number): boolean {
  const e = tabletop();
  const dx = (x - e.cx) / e.rx, dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}
