// Pure animation table for the roundtable sprites. No Phaser, no DOM.
export type ActorState = 'idle' | 'talk' | 'think';
export type AnimFrame = { x: number; y: number; w: number; h: number; duration: number };
export type ActorAnimation = { key: string; image: string; fallback: string | null };

export const ANCHOR = { x: 0.5, y: 282 / 288 };
export const ACTOR_IDS = ['player', 'maya', 'ken', 'alex', 'nora', 'sam'];

const STATES: ActorState[] = ['idle', 'talk', 'think'];
const SEATED = new Set(['player', 'maya', 'ken']);
const STANDING_FALLBACK = 'standing drawing shown from the waist up behind the table: no seated art yet';
const SAM_FALLBACK = 'temporary seated rig: his standing drawing over the player’s recoloured seated legs, no seated art yet';
const KEN_THINK_FALLBACK = 'holds his seated idle drawing (the upper-body thinking substitute has another head scale)';

export const MISSING_ART: string[] = [
  'Alex, Nora and Sam have only standing pose drawings: there is no walk art and no seated art for them yet.',
  'Sam is seated by a temporary runtime rig (his standing upper body over the player’s recoloured seated legs), not drawn seated art.',
  "Ken has no drawn seated thinking pose: he keeps his seated idle drawing while thinking.",
  'Blinks and closed mouths are painted at runtime from each drawing’s own pixels, not drawn frames.',
];

export function frameAt(frames: AnimFrame[], elapsedMs: number): number {
  if (!frames.length) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  let total = 0;
  for (const f of frames) total += f.duration > 0 ? f.duration : 0;
  if (total <= 0) return 0;
  let t = elapsedMs % total;
  for (let i = 0; i < frames.length; i++) {
    const d = frames[i].duration > 0 ? frames[i].duration : 0;
    if (t < d) return i;
    t -= d;
  }
  return frames.length - 1;
}

export function actorAnimation(actor: string, state: ActorState): ActorAnimation {
  if (!ACTOR_IDS.includes(actor)) throw new Error(`unknown actor: ${actor}`);
  if (!STATES.includes(state)) throw new Error(`unknown state: ${state}`);
  const seated = SEATED.has(actor);
  const name = seated ? `seated-${state}` : state;
  let fallback: string | null = null;
  if (actor === 'sam') fallback = SAM_FALLBACK;
  else if (!seated) fallback = STANDING_FALLBACK;
  else if (actor === 'ken' && state === 'think') fallback = KEN_THINK_FALLBACK;
  return { key: `${actor}:${name}`, image: `${actor}-${name}.png`, fallback };
}
