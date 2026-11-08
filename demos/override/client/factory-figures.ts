// Pure helpers for the factory floor: static pose images, no animation. No Phaser, no DOM.

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
