// Pure motion for the pose-image figures (factory, department, renaissance). No Phaser, no DOM.
// Static art gets its life from whole-pixel breathing, a step hop and a stepped lean; packs with
// drawn loops (renaissance) cycle their idle, talk and walk frames instead.
import type { Pose } from './factory-figures';

/** What a figure shows this frame: a pose image or a drawn loop frame, plus whole-pixel offsets. */
export type Look = {
  texture: { kind: 'pose'; pose: Pose } | { kind: 'idle' | 'talk' | 'think' | 'walk' | 'gesture'; frame: number };
  /** Height change in canvas pixels, about the feet: negative squashes, positive stretches. */
  stretch: number;
  /** Lift off the ground in canvas pixels. */
  lift: number;
  /** Lean in degrees about the feet; positive leans clockwise. */
  lean: number;
};

/** Drawn frame counts for one sprite: idle loop, talk loop, walk cycle (0: none drawn). `think`: a drawn thinking
 * loop (absent: the still thinking pose); `blink`: the idle frame that is a blink (absent: no blink frame). */
export type Drawn = { idle: number; talk: number; walk: number; think?: number; blink?: number };
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

/** Idle loop: ping-pong over the drawn frames (0 1 2 3 2 1), each held `holdMs`. A blink frame (index `blink`)
 * is left out of the ping-pong; blinkAt shows it now and then instead. */
export const IDLE_HOLD_MS = 520;
export function idleFrameAt(frames: number, t: number, holdMs = IDLE_HOLD_MS, blink = -1): number {
  if (frames <= 1) return 0;
  const skip = blink >= 0 && blink < frames;
  const n = skip ? frames - 1 : frames;
  const k = n <= 1 || !Number.isFinite(t) ? 0 : pingPong(n, Math.floor(Math.max(0, t) / holdMs));
  return skip && k >= blink ? k + 1 : k;
}

function pingPong(n: number, step: number): number {
  const cycle = 2 * n - 2;
  const s = step % cycle;
  return s < n ? s : cycle - s;
}

/** A drawn blink: shown for BLINK_MS once every 4 to 6.5 s (by seed), counted from the pose change, so a figure
 * never blinks the moment it goes back to standing and neighbours never blink together. */
export const BLINK_MS = 160;
export function blinkAt(since: number, seed: number): boolean {
  if (!Number.isFinite(since) || since < 0) return false;
  const period = 4000 + 2500 * seed;
  return since % period >= period - BLINK_MS;
}

/** A drawn talk loop: each frame held TALK_FRAME_MS from the pose change, so a line starts on frame 0. */
export const TALK_FRAME_MS = 420;
/** A drawn thinking loop: each frame held THINK_HOLD_MS from the pose change (eyes open, then closed), so one
 * open-and-closed cycle lasts as long as one think sway (2.6 s). */
export const THINK_HOLD_MS = 1300;
export function thinkFrameAt(frames: number, since: number): number {
  if (frames <= 1 || !Number.isFinite(since)) return 0;
  return Math.floor(Math.max(0, since) / THINK_HOLD_MS) % frames;
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

/** A standing figure at time `t`, `sincePose` ms after its pose last changed. Drawn loops count from the pose
 * change: talk and think start on their frame 0; the idle loop starts at a phase seeded per figure, so neighbours
 * standing since the start never breathe in step. */
export function standLook(pose: Pose, t: number, seed: number, sincePose: number, drawn: Drawn = NO_DRAWN): Look {
  const pop = popStretch(sincePose);
  const since = Number.isFinite(sincePose) ? Math.max(0, sincePose) : 0;
  if (pose === 'speaking') {
    const texture: Look['texture'] = drawn.talk > 1 ? { kind: 'talk', frame: Math.floor(since / TALK_FRAME_MS) % drawn.talk } : { kind: 'pose', pose };
    return { texture, stretch: pop || talkBob(t, seed), lift: 0, lean: 0 };
  }
  if (pose === 'thinking') {
    const texture: Look['texture'] = (drawn.think ?? 0) > 1 ? { kind: 'think', frame: thinkFrameAt(drawn.think!, since) } : { kind: 'pose', pose };
    return { texture, stretch: pop || breath(t * .7, seed), lift: 0, lean: thinkLean(t, seed) };
  }
  if (drawn.idle > 1) {
    const frame = drawn.blink !== undefined && blinkAt(since, seed) ? drawn.blink : idleFrameAt(drawn.idle, since + seed * 10000, IDLE_HOLD_MS, drawn.blink);
    return { texture: { kind: 'idle', frame }, stretch: pop, lift: 0, lean: 0 };
  }
  return { texture: { kind: 'pose', pose }, stretch: pop || breath(t, seed), lift: 0, lean: 0 };
}

/** A one-shot gesture `t` ms after it began, for a line read in `holdMs`: frames 0..hold at frameMs each,
 * `hold` until the line ends, then hold+1..frames-1 at frameMs each. null: the gesture is over (or not started). */
export function gestureFrameAt(g: { frames: number; hold: number; frameMs: number }, t: number, holdMs: number): number | null {
  if (!Number.isFinite(t) || t < 0 || g.frames < 1) return null;
  const inMs = g.hold * g.frameMs;
  if (t < inMs) return Math.floor(t / g.frameMs);
  const outAt = Math.max(inMs, holdMs);
  if (t < outAt) return g.hold;
  const k = g.hold + 1 + Math.floor((t - outAt) / g.frameMs);
  return k < g.frames ? k : null;
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

/** What a standing, idle figure is doing on its own: nothing, pondering (the thinking pose), glancing the
 * other way, or a held weight shift. `since`: ms into the act, for the pose pop. */
export type Chill = { act: 'rest' | 'ponder' | 'glance' | 'shift'; since: number; lean: number };
export const CHILL_REST: Chill = { act: 'rest', since: 0, lean: 0 };

/** The idle routine at time `t`: time runs in windows of 7 to 12 s (by seed); each window holds one act
 * of 2.4 to 4 s at a seeded start, so no two figures move in step. Pure and repeatable for a seed. */
export function chillAt(t: number, seed: number): Chill {
  if (!Number.isFinite(t) || t < 0) return CHILL_REST;
  const windowMs = 7000 + 5000 * seed;
  const local = t + seed * 31000;
  const k = Math.floor(local / windowMs);
  const into = local - k * windowMs;
  const salt = Math.floor(seed * 1e6);
  const r = unit(k * 7919 + salt);
  const lengthMs = 2400 + 1600 * unit(k * 104729 + salt);
  const startMs = (windowMs - lengthMs) * unit(k * 15485863 + salt);
  if (into < startMs || into >= startMs + lengthMs) return CHILL_REST;
  const since = into - startMs;
  if (r < .25) return CHILL_REST;
  if (r < .55) return { act: 'ponder', since, lean: 0 };
  if (r < .8) return { act: 'glance', since, lean: 0 };
  return { act: 'shift', since, lean: unit(k * 31 + salt) < .5 ? -1 : 1 };
}

/** Where a strolling figure is after `ms` of free time (time the detective was not near and nobody talked to it).
 * The routine visits each route point in turn: rest at home (6 to 14 s, by seed), walk there, linger (3 to 7 s),
 * walk back. It always starts resting at home. `left`: the way it faces (walking: the way it goes; lingering: the
 * way it went), null at home (the slot's own facing). `distance`: units into the current walk, for walkLook. */
export type Stroll = { x: number; y: number; walking: boolean; distance: number; left: boolean | null };
export const STROLL_SPEED = 14;
export function strollAt(ms: number, seed: number, home: { x: number; y: number }, route: readonly { x: number; y: number }[], speed = STROLL_SPEED): Stroll {
  const still: Stroll = { x: home.x, y: home.y, walking: false, distance: 0, left: null };
  if (!route.length || !Number.isFinite(ms) || ms < 0 || speed <= 0) return still;
  const salt = Math.floor(seed * 1e6);
  const legs = route.map((p, i) => {
    const length = Math.hypot(p.x - home.x, p.y - home.y);
    return { p, length, rest: 6000 + 8000 * unit(i * 7919 + salt), walk: length / speed * 1000, linger: 3000 + 4000 * unit(i * 104729 + salt) };
  });
  const cycle = legs.reduce((sum, l) => sum + l.rest + 2 * l.walk + l.linger, 0);
  let t = ms % cycle;
  for (const l of legs) {
    const left = l.p.x < home.x;
    if (t < l.rest) return still;
    t -= l.rest;
    if (t < l.walk) { const k = t / l.walk; return { x: home.x + (l.p.x - home.x) * k, y: home.y + (l.p.y - home.y) * k, walking: true, distance: l.length * k, left }; }
    t -= l.walk;
    if (t < l.linger) return { x: l.p.x, y: l.p.y, walking: false, distance: 0, left };
    t -= l.linger;
    if (t < l.walk) { const k = t / l.walk; return { x: l.p.x + (home.x - l.p.x) * k, y: l.p.y + (home.y - l.p.y) * k, walking: true, distance: l.length * k, left: !left }; }
    t -= l.walk;
  }
  return still;
}

/** Which way a figure faces: flipped means facing left (the art faces right). It turns to the detective
 * while being asked or answering, or when the detective stands within `near` units; otherwise it keeps its
 * slot's facing, turned the other way during a glance. Within 6 units sideways it keeps its current facing. */
export function faceFor(o: { home: boolean; current: boolean; x: number; detective?: { x: number; y: number }; y: number; engaged: boolean; glance: boolean; near?: number }): boolean {
  const d = o.detective;
  const near = o.near ?? 64;
  if (d && (o.engaged || Math.hypot(d.x - o.x, d.y - o.y) <= near)) {
    if (Math.abs(d.x - o.x) < 6) return o.current;
    return d.x < o.x;
  }
  return o.glance ? !o.home : o.home;
}
