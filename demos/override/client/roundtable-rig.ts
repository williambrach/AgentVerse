// Measured data for the roundtable actors: which drawing each state holds, how it registers, where the face is.
// All numbers are pixels of the 192x288 source frames (Sam: of his composed rig frame, see sam-rig.ts).
import type { Box, Rgb } from './face-paint.ts';
import { SAM_RIG } from './sam-rig.ts';

export type RigState = 'idle' | 'talk' | 'think';

export interface StateRig {
  /** The one body drawing shown for the whole state: a strip frame, or Sam's composed rig. */
  source: { image: string; frame: number } | { sam: RigState };
  /** Moves this drawing so its head lands where the idle drawing's head is (measured on the head, +x is right before mirroring). */
  register: readonly [number, number];
  /**
   * Near seats only, where the feet show: the base band (lap, legs, feet) registers on the seat instead, so the feet stay
   * on the floor line when a drawing is taller than idle. It may sit only higher than the torso band (dy no larger):
   * the rows between then hide under the torso band, and no gap can open at the chest seam.
   */
  baseRegister?: readonly [number, number];
  /** Eye windows for the painted blink (inside the lenses for Ken, so the rims stay). */
  eyes: readonly Box[];
  /** Where each eye's fill colour is sampled, when its window is too small to hold enough skin (Ken's lens interiors). */
  skin?: readonly Box[];
  /** The open mouth of a talking drawing, closed by painting between syllables. */
  mouth?: Box;
  /** Head piece = rows [0, neck); torso piece = rows [neck, chest); base = rows [chest, visibleRows). */
  neck: number;
  chest: number;
}

export interface ActorRig {
  states: Record<RigState, StateRig>;
  /** Rows drawn at all: a far standing drawing ends at the waist, so no standing legs exist to show. */
  visibleRows: number;
  lash: Rgb;
  lip: Rgb;
}

const strip = (image: string, frame = 0) => ({ image, frame });
const LASH: Rgb = [24, 14, 12];
/** Ken's windows cover each eye from its upper lash to the bottom of the pupil and stop short of the lens rims, so a blink never thins the glasses. */
const KEN_IDLE_EYES: Box[] = [[84, 63, 92, 73], [109, 62, 115, 72]];
/** Ken's lens interiors, inside the rims (read off the art): the blink's fill colour comes from here. */
const KEN_IDLE_LENSES: Box[] = [[83, 61, 92, 75], [110, 60, 116, 75]];

/** Sam's own eye and mouth windows (his standing drawings), moved into the rig frame. */
const inRig = (state: RigState, box: Box): Box => {
  const { dx, dy } = SAM_RIG.parts[state];
  return [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy];
};

export const RIG: Record<string, ActorRig> = {
  // The player's talk and think drawings are 7-8 rows taller than idle: head and seat register separately, split at
  // row 228 (mid-shin, only vertical lines cross it) so the rows hidden between the bands never cut a slanted arm.
  // Near seats do not breathe in those poses, so that split is not a breathing seam.
  player: {
    visibleRows: 288, lash: LASH, lip: [176, 104, 84],
    states: {
      idle: { source: strip('player-seated-idle.png'), register: [0, 0], eyes: [[77, 61, 93, 77], [98, 60, 109, 75]], neck: 104, chest: 150 },
      talk: { source: strip('player-seated-talk.png', 1), register: [3, 0], baseRegister: [3, -7], eyes: [[74, 62, 91, 78], [96, 60, 107, 75]], mouth: [87, 85, 101, 95], neck: 104, chest: 228 },
      think: { source: strip('player-seated-think.png'), register: [5, -1], baseRegister: [5, -8], eyes: [[72, 62, 89, 77], [93, 61, 105, 76]], neck: 105, chest: 228 },
    },
  },
  maya: {
    visibleRows: 230, lash: LASH, lip: [96, 52, 36],
    states: {
      idle: { source: strip('maya-seated-idle.png'), register: [0, 0], eyes: [[81, 70, 98, 85], [106, 70, 118, 84]], neck: 109, chest: 230 },
      talk: { source: strip('maya-seated-talk.png', 1), register: [6, 1], eyes: [[75, 69, 92, 84], [100, 69, 112, 83]], mouth: [92, 92, 107, 99], neck: 108, chest: 230 },
      think: { source: strip('maya-seated-think.png'), register: [4, 2], eyes: [[78, 67, 95, 82], [103, 67, 115, 81]], neck: 107, chest: 230 },
    },
  },
  ken: {
    visibleRows: 230, lash: LASH, lip: [176, 104, 84],
    states: {
      idle: { source: strip('ken-seated-idle.png'), register: [0, 0], eyes: KEN_IDLE_EYES, skin: KEN_IDLE_LENSES, neck: 105, chest: 230 },
      talk: { source: strip('ken-seated-talk.png', 1), register: [6, -2], eyes: [[76, 63, 87, 74], [103, 63, 111, 72]], skin: [[77, 63, 87, 77], [104, 61, 111, 75]], mouth: [89, 88, 101, 98], neck: 107, chest: 230 },
      // The upper-body thinking substitute is drawn at another head scale: Ken keeps his seated idle drawing.
      think: { source: strip('ken-seated-idle.png'), register: [0, 0], eyes: KEN_IDLE_EYES, skin: KEN_IDLE_LENSES, neck: 105, chest: 230 },
    },
  },
  alex: {
    visibleRows: 172, lash: LASH, lip: [110, 62, 44],
    states: {
      idle: { source: strip('alex-idle.png'), register: [0, 0], eyes: [[87, 55, 101, 67], [107, 55, 118, 66]], neck: 87, chest: 172 },
      talk: { source: strip('alex-talk.png'), register: [9, 0], eyes: [[78, 55, 92, 67], [98, 55, 109, 66]], mouth: [93, 72, 104, 80], neck: 87, chest: 172 },
      think: { source: strip('alex-think.png'), register: [5, -1], eyes: [[82, 57, 96, 68], [102, 56, 113, 66]], neck: 88, chest: 172 },
    },
  },
  nora: {
    visibleRows: 172, lash: LASH, lip: [190, 110, 92],
    states: {
      idle: { source: strip('nora-idle.png'), register: [0, 0], eyes: [[88, 50, 102, 63], [108, 49, 121, 62]], neck: 84, chest: 172 },
      talk: { source: strip('nora-talk.png'), register: [9, 0], eyes: [[79, 50, 93, 63], [99, 49, 112, 62]], mouth: [95, 68, 105, 77], neck: 84, chest: 172 },
      think: { source: strip('nora-think.png'), register: [6, -1], eyes: [[82, 53, 96, 65], [102, 52, 115, 63]], neck: 85, chest: 172 },
    },
  },
  // Registration is built into the rig frames (SAM_RIG.parts), so the states need no offset here.
  sam: {
    visibleRows: 288, lash: LASH, lip: [120, 66, 40],
    states: {
      idle: { source: { sam: 'idle' }, register: [0, 0], eyes: [inRig('idle', [87, 54, 102, 66]), inRig('idle', [107, 53, 121, 65])], neck: 120, chest: 183 },
      talk: { source: { sam: 'talk' }, register: [0, 0], eyes: [inRig('talk', [75, 54, 90, 66]), inRig('talk', [95, 53, 109, 65])], mouth: inRig('talk', [89, 74, 103, 83]), neck: 120, chest: 183 },
      think: { source: { sam: 'think' }, register: [0, 0], eyes: [inRig('think', [81, 56, 96, 68]), inRig('think', [101, 55, 115, 66])], neck: 119, chest: 183 },
    },
  },
};

/** Frame names of an actor's rig texture: the body per state plus its painted face variants. */
export function rigFrames(state: RigState): string[] {
  return state === 'talk' ? ['talk', 'talk:blink', 'talk:closed', 'talk:blink:closed'] : [state, `${state}:blink`];
}

/** The rig frame for a state and face: talk shows the drawing's open mouth unless the mouth is closed between syllables. */
export function faceFrame(state: RigState, blink: boolean, mouthOpen: boolean): string {
  if (state !== 'talk') return blink ? `${state}:blink` : state;
  return `talk${blink ? ':blink' : ''}${mouthOpen ? '' : ':closed'}`;
}
