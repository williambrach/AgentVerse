import type { ActorState } from './sprite-anim.ts';

/**
 * What moves on one actor at a moment. Each state holds a single registered body drawing; only these change:
 * - `torso`: rows below the neck drop 1 px on the out-breath (whole visible body for friends behind the table);
 * - `head`: the head piece's drop, torso plus a short nod (at most 2 px); pieces only ever move down, so no gap opens;
 * - `blink` / `mouthOpen`: which painted face variant the head shows.
 */
export interface Motion { head: number; torso: number; blink: boolean; mouthOpen: boolean }

export interface MotionOptions {
  /** Extra time offset in ms (each actor already has its own phase from its id). */
  phase?: number;
  /** prefers-reduced-motion: nothing moves, the drawing's own face shows. */
  still?: boolean;
  /** Someone else is talking: an idle listener nods now and then. */
  listening?: boolean;
  /** Seated in front of the table with the whole body visible: breathes only while idle (other poses cross the chest seam). */
  near?: boolean;
}

export const MOTION = {
  blinkSlot: 4300, thinkBlinkSlot: 5600, blinkMs: [110, 160], doubleBlink: 0.18, doubleGap: 150,
  breathMs: [4300, 5600], exhale: [0.5, 0.86],
  phraseMs: 2100, pauseMs: 380, syllableMs: 135, openShare: 0.67,
  talkNod: 0.55, nodDelay: 120, nodMs: 330,
  listenSlot: 3700, listenNod: 0.35, listenNodMs: 280,
};

/** Deterministic noise in [0, 1) for an actor, a channel and a slot index (FNV-1a with a final mix). */
export function unit(actor: string, channel: string, k: number): number {
  const s = `${actor}|${channel}|${k}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function blinking(actor: string, state: ActorState, t: number): boolean {
  // Each actor's slot is its own length, so blinks drift apart instead of meeting again.
  const slot = (state === 'think' ? MOTION.thinkBlinkSlot : MOTION.blinkSlot) * (0.9 + 0.2 * unit(actor, 'slot', 0));
  const k = Math.floor(t / slot), at = t - k * slot;
  const start = slot * (0.25 + 0.6 * unit(actor, 'blink', k));
  const ms = MOTION.blinkMs[0] + (MOTION.blinkMs[1] - MOTION.blinkMs[0]) * unit(actor, 'blink-ms', k);
  if (at >= start && at < start + ms) return true;
  const again = start + ms + MOTION.doubleGap;
  return unit(actor, 'double', k) < MOTION.doubleBlink && at >= again && at < again + ms;
}

function breath(actor: string, t: number): number {
  const period = MOTION.breathMs[0] + (MOTION.breathMs[1] - MOTION.breathMs[0]) * unit(actor, 'breath', 0);
  const cycle = (t % period) / period;
  return cycle >= MOTION.exhale[0] && cycle < MOTION.exhale[1] ? 1 : 0;
}

/** A nod: 1, 2, 2, 1 px over its length (or 1 px for a listener's small one). */
const nodShape = (u: number, deep: boolean) => (u < 0 || u >= 1 ? 0 : deep && u >= 0.2 && u < 0.7 ? 2 : 1);

export function naturalMotion(actor: string, state: ActorState, elapsed: number, options: MotionOptions = {}): Motion {
  const { phase = 0, still = false, listening = false, near = false } = options;
  if (still) return { head: 0, torso: 0, blink: false, mouthOpen: true };
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const own = unit(actor, 'phase', 0) * 10000 + (Number.isFinite(phase) ? phase : 0);
  const t = time + own;
  const blink = blinking(actor, state, t);
  const torso = state === 'talk' || (near && state !== 'idle') ? 0 : breath(actor, t);
  let nod = 0, mouthOpen = true;
  if (state === 'talk') {
    // Phrases start when the talking starts (elapsed restarts on every state change).
    const k = Math.floor(time / MOTION.phraseMs), at = time - k * MOTION.phraseMs;
    if (unit(actor, 'nod', k) < MOTION.talkNod) nod = nodShape((at - MOTION.nodDelay) / MOTION.nodMs, true);
    if (at >= MOTION.phraseMs - MOTION.pauseMs) mouthOpen = false;
    else mouthOpen = unit(actor, 'syllable', k * 64 + Math.floor(at / MOTION.syllableMs)) < MOTION.openShare;
  } else if (state === 'idle' && listening) {
    const slot = MOTION.listenSlot * (0.85 + 0.3 * unit(actor, 'listen-slot', 0));
    const k = Math.floor(t / slot), at = t - k * slot;
    if (unit(actor, 'listen', k) < MOTION.listenNod) nod = nodShape((at - slot * (0.2 + 0.5 * unit(actor, 'listen-at', k))) / MOTION.listenNodMs, false);
  }
  return { head: torso + nod, torso, blink, mouthOpen };
}
