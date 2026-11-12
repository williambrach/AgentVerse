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
  /** Per-sprite size factor on top of scale, so cast drawn at different heights in the frame stand equally tall. Absent: 1. */
  sizes?: Record<string, number>;
  density: number;
  labelLift: number;
  /** Walk-cycle frames `<detective>-walk-<i>.png`; absent: the detective hops in its still pose. */
  walkFrames?: number;
  /** The detective's walk as one supplied sprite sheet, drawn as it is (wins over walkFrames). */
  walkSheet?: WalkSheet;
  /** Drawn loops `<sprite>-idle-<i>.png` (every sprite) and `<sprite>-talk-<i>.png` (count by sprite);
   * absent: the still poses breathe and bob in code. `think`: drawn thinking loops `<sprite>-think-<i>.png` by sprite
   * (absent: the still thinking pose); `blink`: the idle frame that is a blink, by sprite (shown now and then, never
   * in the idle ping-pong). */
  loops?: { idle: number; talk: Record<string, number>; think?: Record<string, number>; blink?: Record<string, number> };
  /** One-shot object gestures by sprite (renaissance apothecary: the vial), drawn as `<sprite>-<name>-<i>.png`.
   * Played once while that sprite answers one of `topics`; never an idle or talk loop. */
  gestures?: Record<string, Gesture>;
  /** Idle cast live on their own (figure-motion chillAt): ponder, glance away, shift weight; and turn to the
   * detective when near or engaged (faceFor). Absent: they only breathe and keep their slot's facing. */
  chill?: boolean;
  /** Names of the two desk props at the stops; absent: case-folder and notebook. */
  stopProps?: { briefing: string; report: string };
}

/** A one-shot gesture: frames 0..hold play in, `hold` stays while the line is read, the rest play out. */
export interface Gesture {
  name: string;
  frames: number;
  hold: number;
  frameMs: number;
  topics: string[];
}

/** The gesture `sprite` makes when it answers `topic`, if any. */
export function gestureFor(art: FigureArt, sprite: string, topic: string | undefined): Gesture | undefined {
  const g = art.gestures?.[sprite];
  return g && topic !== undefined && g.topics.includes(topic) ? g : undefined;
}

export function gestureUrl(art: FigureArt, sprite: string, g: Gesture, i: number): string {
  return `${art.base}/${sprite}-${g.name}-${i}.png`;
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
  /** Per-frame vertical registration in cell px (positive draws the frame lower), one entry per frame:
   * damps a drawn head bob or puts a lifted frame's feet back on the floor. Absent: all 0. */
  offsets?: number[];
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

/** Where sheet frame i's origin sits, as fractions of the frame: the pivot, raised by the frame's offset
 * (a frame drawn lower has its foot point higher inside it). x stays at the window centre in every frame. */
export function sheetOrigin(sheet: WalkSheet, i = 0): { x: number; y: number } {
  return { x: .5, y: (sheet.pivot.y - (sheet.offsets?.[i] ?? 0)) / sheet.cell.h };
}

export function stopPropsOf(art: FigureArt): { briefing: string; report: string } {
  return art.stopProps ?? { briefing: 'case-folder', report: 'notebook' };
}

export function walkFrameUrl(art: FigureArt, i: number): string {
  return `${art.base}/${art.detective}-walk-${i}.png`;
}

export function loopUrl(art: FigureArt, sprite: string, kind: 'idle' | 'talk' | 'think', i: number): string {
  return `${art.base}/${sprite}-${kind}-${i}.png`;
}

/** The drawn frames one sprite has; the walk cycle belongs to the detective alone. A think loop and a blink
 * frame are named only for the sprites that have them. */
export function drawnOf(art: FigureArt, sprite: string): Drawn {
  const think = art.loops?.think?.[sprite], blink = art.loops?.blink?.[sprite];
  return {
    idle: art.loops?.idle ?? 0,
    talk: art.loops?.talk[sprite] ?? 0,
    walk: sprite === art.detective ? art.walkSheet?.frames ?? art.walkFrames ?? 0 : 0,
    ...(think !== undefined ? { think } : {}),
    ...(blink !== undefined ? { blink } : {}),
  };
}

export function poseUrl(art: FigureArt, sprite: string, pose: Pose): string {
  return `${art.base}/${sprite}-${pose}.png`;
}

export function propUrl(art: FigureArt, id: string): string {
  return `${art.props}/${id}.png`;
}

/** World units per image px for one sprite's pose frames: the pack's scale times its size factor. */
export function spriteScale(art: FigureArt, sprite: string, depth = 1): number {
  return art.scale * (art.sizes?.[sprite] ?? 1) * depth;
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
