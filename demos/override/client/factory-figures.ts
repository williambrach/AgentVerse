// Pure helpers for the pose-image figures (factory, department, renaissance): urls, boxes, poses. No Phaser, no DOM.
// Their motion lives in figure-motion.ts.
import type { Drawn } from './figure-motion';

export type Pose = 'listening' | 'speaking' | 'thinking';

export interface FigureArt {
  base: string;
  props: string;
  sprites: Record<string, string>;
  detective: string;
  frame: { w: number; h: number };
  anchor: { x: number; y: number };
  scale: number;
  density: number;
  labelLift: number;
  /** Walk-cycle frames `<detective>-walk-<i>.png`; absent: the detective hops in its still pose. */
  walkFrames?: number;
  /** The detective's walk as one supplied sprite sheet, drawn as it is (wins over walkFrames). */
  walkSheet?: WalkSheet;
  /** Drawn loops `<sprite>-idle-<i>.png` (every sprite) and `<sprite>-talk-<i>.png` (count by sprite);
   * absent: the still poses breathe and bob in code. */
  loops?: { idle: number; talk: Record<string, number> };
  /** Names of the two desk props at the stops; absent: case-folder and notebook. */
  stopProps?: { briefing: string; report: string };
}

/** A walk-cycle sprite sheet used untouched: equal cells read left to right, row by row, and drawn with
 * their own pivot and scale, because the cells and the still-pose frames differ in size and padding. */
export interface WalkSheet {
  url: string;
  cell: { w: number; h: number };
  columns: number;
  frames: number;
  /** The foot point inside every cell, one pivot for all frames (never per-frame silhouette bounds): x is the
   * column the figure turns about, y the ground line. Phaser flips a frame about its middle, so each frame is
   * cut as the widest window centred on x (sheetRect); a pivot off the cell centre then still turns on the spot. */
  pivot: { x: number; y: number };
  /** World units per cell px, chosen so the walking figure is as tall as the still poses. */
  scale: number;
  /** How long each frame shows while walking, in ms of walking time. */
  frameMs: number;
}

/** Cell i's rectangle in the sheet, read left to right, row by row. */
export function sheetCell(sheet: WalkSheet, i: number): { x: number; y: number; w: number; h: number } {
  return { x: (i % sheet.columns) * sheet.cell.w, y: Math.floor(i / sheet.columns) * sheet.cell.h, w: sheet.cell.w, h: sheet.cell.h };
}

/** Frame i's source rectangle: the same window in every cell, centred on the pivot column, never wider than the cell. */
export function sheetRect(sheet: WalkSheet, i: number): { x: number; y: number; w: number; h: number } {
  const cell = sheetCell(sheet, i);
  const half = Math.min(sheet.pivot.x, sheet.cell.w - sheet.pivot.x);
  return { x: cell.x + sheet.pivot.x - half, y: cell.y, w: 2 * half, h: cell.h };
}

/** Where a sheet frame's origin sits, as fractions of the frame: the pivot. */
export function sheetOrigin(sheet: WalkSheet): { x: number; y: number } {
  return { x: .5, y: sheet.pivot.y / sheet.cell.h };
}

export function stopPropsOf(art: FigureArt): { briefing: string; report: string } {
  return art.stopProps ?? { briefing: 'case-folder', report: 'notebook' };
}

export function walkFrameUrl(art: FigureArt, i: number): string {
  return `${art.base}/${art.detective}-walk-${i}.png`;
}

export function loopUrl(art: FigureArt, sprite: string, kind: 'idle' | 'talk', i: number): string {
  return `${art.base}/${sprite}-${kind}-${i}.png`;
}

/** The drawn frames one sprite has; the walk cycle belongs to the detective alone. */
export function drawnOf(art: FigureArt, sprite: string): Drawn {
  return {
    idle: art.loops?.idle ?? 0,
    talk: art.loops?.talk[sprite] ?? 0,
    walk: sprite === art.detective ? art.walkSheet?.frames ?? art.walkFrames ?? 0 : 0,
  };
}

export function poseUrl(art: FigureArt, sprite: string, pose: Pose): string {
  return `${art.base}/${sprite}-${pose}.png`;
}

export function propUrl(art: FigureArt, id: string): string {
  return `${art.props}/${id}.png`;
}

/** The frame's rectangle in world units, placed so its foot anchor sits on `foot`. */
export function figureBox(art: FigureArt, foot: { x: number; y: number }): { left: number; top: number; width: number; height: number } {
  return {
    left: foot.x - art.anchor.x * art.scale,
    top: foot.y - art.anchor.y * art.scale,
    width: art.frame.w * art.scale,
    height: art.frame.h * art.scale,
  };
}

/** The detective thinks while a worker is being asked or while the player types; everyone else listens unless named. */
export function poseFor(state: { thinking: string | null; speaking: string | null; typing: boolean }, id: string): Pose {
  if (id === 'detective') return state.typing || state.thinking !== null ? 'thinking' : 'listening';
  if (state.thinking === id) return 'thinking';
  if (state.speaking === id) return 'speaking';
  return 'listening';
}

/** How long a line stays up: 1500 ms plus 250 ms a word, held between 2 and 8 seconds. */
export function speakMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(8000, Math.max(2000, 1500 + 250 * words));
}
