// Pure motion for the pose-image figures (factory, department, renaissance). No Phaser, no DOM.
// Static art gets its life from whole-pixel breathing, a step hop and a stepped lean; packs with
// drawn loops (renaissance) cycle their idle, talk and walk frames instead.
import type { Pose } from './factory-figures';

/** What a figure shows this frame: a pose image or a drawn loop frame, plus whole-pixel offsets. */
export type Look = {
  texture: { kind: 'pose'; pose: Pose } | { kind: 'idle' | 'talk' | 'walk'; frame: number };
  /** Height change in canvas pixels, about the feet: negative squashes, positive stretches. */
  stretch: number;
  /** Lift off the ground in canvas pixels. */
  lift: number;
  /** Lean in degrees about the feet; positive leans clockwise. */
  lean: number;
};

/** Drawn frame counts for one sprite: idle loop, talk loop, walk cycle (0: none drawn). */
export type Drawn = { idle: number; talk: number; walk: number };
export const NO_DRAWN: Drawn = { idle: 0, talk: 0, walk: 0 };

/** A stable 0..1 per figure id, so neighbours never breathe or blink in step. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const unit = (n: number) => { const h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0; return (Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0) / 4294967296; };

/** Pose change: squash, stretch, settle, over 240 ms. */
export const POP_MS = 240;
export function popStretch(sinceMs: number): number {
  if (sinceMs < 0 || sinceMs >= POP_MS) return 0;
  return sinceMs < 80 ? -3 : sinceMs < 160 ? 3 : 1;
}

/** Idle loop: ping-pong over the drawn frames (0 1 2 3 2 1), each held `holdMs`. */
export const IDLE_HOLD_MS = 520;
export function idleFrameAt(frames: number, t: number, holdMs = IDLE_HOLD_MS): number {
  if (frames <= 1 || !Number.isFinite(t)) return 0;
  const cycle = 2 * frames - 2;
  const step = Math.floor(Math.max(0, t) / holdMs) % cycle;
  return step < frames ? step : cycle - step;
}

/** Breathing for static art: 0, 1 or 2 canvas pixels taller, one breath every 2.8 to 3.6 s. */
export function breath(t: number, seed: number): number {
  const period = 2800 + 800 * seed;
  return Math.round(1 - Math.cos(2 * Math.PI * (t / period + seed)));
}

/** Talking: a beat every 150 ms alternates rest and a 1 to 3 pixel stretch, like stressed syllables. */
export const TALK_BEAT_MS = 150;
export function talkBob(t: number, seed: number): number {
  const beat = Math.floor(Math.max(0, t) / TALK_BEAT_MS);
  if (beat % 2 === 0) return 0;
  return 1 + Math.floor(unit(beat + Math.floor(seed * 1e6)) * 3);
}

/** Thinking: a slow sway in half-degree steps, at most 1.5 degrees either way. */
export function thinkLean(t: number, seed: number): number {
  return Math.round(3 * Math.sin(2 * Math.PI * (t / 2600 + seed))) / 2;
}

/** The still pose, as reduced motion shows it. */
export function stillLook(pose: Pose): Look {
  return { texture: { kind: 'pose', pose }, stretch: 0, lift: 0, lean: 0 };
}

/** A standing figure at time `t`, `sincePose` ms after its pose last changed. */
export function standLook(pose: Pose, t: number, seed: number, sincePose: number, drawn: Drawn = NO_DRAWN): Look {
  const pop = popStretch(sincePose);
  const local = t + seed * 10000;
  if (pose === 'speaking') {
    const texture: Look['texture'] = drawn.talk > 1 ? { kind: 'talk', frame: Math.floor(local / 420) % drawn.talk } : { kind: 'pose', pose };
    return { texture, stretch: pop || talkBob(t, seed), lift: 0, lean: 0 };
  }
  if (pose === 'thinking') return { texture: { kind: 'pose', pose }, stretch: pop || breath(t * .7, seed), lift: 0, lean: thinkLean(t, seed) };
  if (drawn.idle > 1) return { texture: { kind: 'idle', frame: idleFrameAt(drawn.idle, local) }, stretch: pop, lift: 0, lean: 0 };
  return { texture: { kind: 'pose', pose }, stretch: pop || breath(t, seed), lift: 0, lean: 0 };
}

/** World units per drawn walk frame: four frames make one step of about 38 units at the renaissance scale. */
export const WALK_FRAME_UNITS = 9.5;
/** World units per step for static art: a hop and a lean each step, leaning the other way the next. */
export const STEP_UNITS = 30;

/** A walking figure, `distance` world units into its walk. Static art hops; drawn art cycles frames,
 * by distance, or by walking time when `clock` gives a frame duration (a sheet's frameMs). */
export function walkLook(distance: number, pose: Pose, drawn: Drawn = NO_DRAWN, clock?: { ms: number; frameMs: number }): Look {
  const d = Math.max(0, distance);
  if (drawn.walk > 0) {
    const step = clock && clock.frameMs > 0 ? Math.floor(Math.max(0, clock.ms) / clock.frameMs) : Math.floor(d / WALK_FRAME_UNITS);
    return { texture: { kind: 'walk', frame: step % drawn.walk }, stretch: 0, lift: 0, lean: 0 };
  }
  const phase = Math.sin(Math.PI * d / STEP_UNITS);
  const up = Math.abs(phase);
  return { texture: { kind: 'pose', pose }, stretch: up < .2 ? -2 : 0, lift: Math.round(3 * up), lean: Math.round(4 * phase) / 2 };
}

/** Travel along a walk. `held`: a direction key is down. Physics can tick slower than rendering (60 Hz
 * physics on a 120 Hz screen), so a render frame without travel keeps the stride; only 80 ms without
 * travel (a wall), a release, or a jump of more than 24 units ends it. `ms` is walking time, for
 * time-played sheets; a new walk starts it, and so frame 1, from zero. */
export type Stride = { distance: number; ms: number; stillMs: number; walking: boolean };
export const STANDING: Stride = { distance: 0, ms: 0, stillMs: 0, walking: false };
export function strideNext(prev: Stride, traveled: number, held: boolean, deltaMs: number): Stride {
  if (!held || traveled > 24) return STANDING;
  const ms = prev.walking ? (prev.ms + Math.max(0, deltaMs)) % 1e9 : 0;
  if (traveled >= .01) return { distance: (prev.distance + traveled) % 1e6, ms, stillMs: 0, walking: true };
  const stillMs = prev.stillMs + deltaMs;
  return stillMs >= 80 ? { ...STANDING, stillMs } : { ...prev, ms, stillMs };
}
