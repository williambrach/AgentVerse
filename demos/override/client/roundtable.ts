import Phaser from 'phaser';
import type { Character } from './types';
import type { WorldPack } from './worlds';
import { plain } from './text.ts';
import { actorAnimation, frameAt, ANCHOR } from './sprite-anim';
import type { ActorState, AnimFrame } from './sprite-anim';
import { seats, table, fitRoom, farEdge, tablePoint, chairs, ROOM, DEPTH, TILT } from './roundtable-layout';
import type { Seat } from './roundtable-layout';
import { COMPACT_QUERY, RAIL } from './stage-layout';
import { BUBBLE, bubbleFit, bubbleX } from './bubble-fit';
import type { StageLayout } from './stage-layout';
import { naturalMotion } from './roundtable-motion';
import type { Motion } from './roundtable-motion';
import { RIG, rigFrames, faceFrame } from './roundtable-rig';
import type { RigState, StateRig } from './roundtable-rig';
import { paintBlink, paintClosedMouth, applyOverlay, opaqueBounds } from './face-paint';
import type { Box, Pixels } from './face-paint';
import { composeSeatedSam, SAM_RIG } from './sam-rig';

const ASSETS = '/assets/friends/';
const STATES: ActorState[] = ['idle', 'talk', 'think'];
const ROOM_IMAGES = ['roundtable-fullscreen', 'fireplace-loop', 'sconce-loop', 'wall-panel', 'floor-panel', 'bookcase', 'window', 'plant', 'chair-front', 'chair-left', 'chair-right'];
const TABLE_PROPS = ['card_back', 'card_clubs_A', 'card_hearts_A', 'card_diamonds_07', 'card_spades_K', 'dice_3', 'dice_5', 'cookie', 'cup', 'tea_01', 'tea_03', 'tea_08'];
const WALL = 0x40302b, FLOOR = 0x241f20;
/** Each actor starts its loop a little apart from the others, so the table never blinks in unison. */
const PHASE_MS = 137;
const MAX_DELTA = 100;
const PLAYER_TALK_MS = 1200;
const HUD_CLEAR = 84;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const FRAME = { width: 192, height: 288 };
const STILL: Motion = { head: 0, torso: 0, blink: false, mouthOpen: true };
/** Click targets reach this far past the drawn body (never below the table's far edge for a friend behind it). */
const HIT_PAD = 6;
/** Samples along the table's far edge for a far friend's click target (the chord error is far below a pixel). */
const HIT_STEPS = 12;
/** A 42x60 card lies about 34x48 in the table plane (a little over real size, so a face-down card still reads at 1x). */
const CARD_SCALE = 0.8;
/** Each seat's place on the table (u, v across the tabletop, v -1 the far edge): maya, ken, alex, nora, you, sam. */
const PLACES: [number, number][] = [[-0.47, -0.48], [-0.17, -0.62], [0.17, -0.62], [0.47, -0.48], [-0.55, 0.16], [0.55, 0.16]];
const DRINKS: [string, number, number][] = [['tea_01', -0.62, -0.34], ['tea_03', -0.02, -0.7], ['tea_08', 0.63, -0.34], ['cup', -0.6, 0.36], ['tea_01', 0.64, -0.02]];

export interface ActorView {
  id: string;
  name: string;
  layer: Seat['layer'];
  state: ActorState;
  key: string;
  /** Plain words when the pose is not drawn art for this seat (null for drawn seated poses). */
  fallback: string | null;
  /**
   * The torso piece. Every state holds one registered drawing, shown as three row bands of it:
   * `head` (nods, blinks, mouth), `sprite` (the torso, breathes) and `base` (stays put).
   */
  sprite: Phaser.GameObjects.Sprite;
  head: Phaser.GameObjects.Sprite;
  base: Phaser.GameObjects.Sprite;
  /** Click target over the visible body: never the part hidden behind the table. */
  hit: Phaser.GameObjects.Zone;
  /** The target's shape in the zone's own coordinates: its lower edge follows the table's far edge for a far friend. */
  hitShape?: Phaser.Geom.Polygon;
  seat: Seat;
  elapsed: number;
  offset: number;
  talkMs: number;
  thinking: boolean;
  /** The pose and face drawn now (tests read it). */
  motion: Motion;
  /** Head frame name shown now: the state, plus `:blink` / `:closed` face variants. */
  face: string;
}
interface Effect { sprite: Phaser.GameObjects.Sprite; frames: AnimFrame[]; image: string; elapsed: number; frame: number }
type AnimSet = Record<string, { image: string; frames: AnimFrame[] }>;

const textureKey = (image: string) => `friends:${image}`;
const roomKey = (name: string) => `friends-room:${name}`;
/** One canvas texture per actor: each state's registered drawing and its painted face variants, built once from the loaded strips. */
const rigKey = (actor: string) => `friends-rig:${actor}`;
const RIG_STATES: RigState[] = ['idle', 'talk', 'think'];
const keyOf = (world: WorldPack, cast: Character[]) => `${world.id}|${cast.map(c => c.id).join(',')}`;

export class Roundtable extends Phaser.Scene {
  actors = new Map<string, ActorView>();
  /** The table image, once created (tests read its depth and size). */
  tableImage?: Phaser.GameObjects.Image;
  private onArrival: (id: string) => void;
  private onHint: (hint: string) => void;
  private world?: WorldPack;
  private cast: Character[] = [];
  private builtKey = '';
  private created = false;
  private layout: StageLayout;
  private resizeBound = false;
  private enabled = false;
  private covered = false;
  private focusId: string | null = null;
  private currentHint = '';
  private overlay?: HTMLDivElement;
  private backdrop: Phaser.GameObjects.GameObject[] = [];
  private effects: Effect[] = [];
  private sleepAfterRender?: () => void;
  /** Opaque bounds of each actor's state drawings within its visible rows (click targets, chair placement). */
  private bounds = new Map<string, Record<RigState, Box | null>>();

  constructor(onArrival: (id: string) => void, onHint: (hint: string) => void) {
    super('roundtable');
    this.onArrival = onArrival;
    this.onHint = onHint;
    this.layout = this.windowLayout();
  }

  get table() { return this.tableImage; }

  private windowLayout(): StageLayout {
    return fitRoom(window.innerWidth, window.innerHeight, RAIL, matchMedia(COMPACT_QUERY).matches);
  }

  /** Size the game to the window and put the 1280x720 room at its offset; the backdrop is redrawn to cover the whole area. */
  private applyLayout() {
    this.layout = this.windowLayout();
    const { width: w, height: h, offsetX, offsetY } = this.layout;
    if (this.scale.gameSize.width !== w || this.scale.gameSize.height !== h) this.scale.setGameSize(w, h);
    this.scale.refresh();
    this.cameras?.main?.setScroll(-offsetX, -offsetY);
    if (this.created) this.drawBackdrop();
    this.syncOverlay();
  }

  /** Re-fit only while the roundtable is shown: the stage hides its container behind the station, and a zero-size parent would collapse the canvas. Showing it again fires the observer, which fits to the then-current window. */
  private relayout() {
    const parent = this.game?.canvas?.parentElement;
    if (parent && !parent.clientWidth) return;
    this.applyLayout();
  }

  /** Switch cast: a no-op when unchanged, otherwise the scene restarts. While loading, the latest values are picked up in create(). */
  configure(world: WorldPack, cast: Character[]) {
    const next = cast.filter(c => seats().some(s => s.actor === c.id && c.id !== 'player'));
    if (this.world && keyOf(world, next) === keyOf(this.world, this.cast)) return;
    this.world = world;
    this.cast = next;
    if (!this.created) return;
    // A covered scene has its loop asleep; wake it so the restart runs, create() puts it back to sleep.
    this.cancelSleep();
    this.game?.loop.wake();
    this.scene.restart({ world, cast: next });
  }

  init(data?: { world?: WorldPack; cast?: Character[] }) {
    if (data?.world) this.world = data.world;
    if (data?.cast) this.cast = data.cast;
    this.builtKey = this.world ? keyOf(this.world, this.cast) : '';
    this.created = false;
    this.actors = new Map();
    this.effects = [];
    this.backdrop = [];
    this.tableImage = undefined;
    this.overlay?.replaceChildren();
    this.focusId = null;
    this.currentHint = '';
  }

  preload() {
    const loaded = this.cache.json;
    if (loaded.exists('friends-animations')) loaded.remove('friends-animations');
    if (loaded.exists('friends-room-animations')) loaded.remove('friends-room-animations');
    this.load.json('friends-animations', `${ASSETS}animations.json`);
    this.load.json('friends-room-animations', `${ASSETS}room/animations.json`);
    const images = new Set<string>();
    for (const seat of seats()) for (const state of STATES) images.add(actorAnimation(seat.actor, state).image);
    images.forEach(image => { if (!this.textures.exists(textureKey(image))) this.load.image(textureKey(image), `${ASSETS}${image}`); });
    ROOM_IMAGES.forEach(name => { if (!this.textures.exists(roomKey(name))) this.load.image(roomKey(name), `${ASSETS}room/${name}.png`); });
    TABLE_PROPS.forEach(name => { if (!this.textures.exists(`tabletop:${name}`)) this.load.image(`tabletop:${name}`, `/assets/tabletop/${name}.png`); });
  }

  /** Every frame rectangle of an animation becomes a named frame `f<i>` on its strip texture. */
  private addFrames(image: string, frames: AnimFrame[], key: string) {
    if (!this.textures.exists(key)) return;
    const texture = this.textures.get(key);
    frames.forEach((f, i) => { if (!texture.has(`f${i}`)) texture.add(`f${i}`, 0, f.x, f.y, f.w, f.h); });
  }

  private animations(): { actors: AnimSet; room: AnimSet } {
    const actors = (this.cache.json.get('friends-animations')?.animations ?? {}) as AnimSet;
    const room = (this.cache.json.get('friends-room-animations')?.animations ?? {}) as AnimSet;
    return { actors, room };
  }

  create() {
    // configure() ran while loading: restart with the latest cast instead of building the old one.
    if (this.world && this.builtKey !== keyOf(this.world, this.cast)) { this.scene.restart({ world: this.world, cast: this.cast }); return; }
    this.cameras.main.setBackgroundColor(WALL);
    this.applyLayout();
    if (!this.resizeBound) {
      this.resizeBound = true;
      window.addEventListener('resize', () => this.relayout());
      matchMedia(COMPACT_QUERY).addEventListener('change', () => this.relayout());
      // The container is hidden while the walking world is shown; showing it changes its size without a window resize.
      const parent = this.game.canvas.parentElement;
      if (parent) new ResizeObserver(() => this.relayout()).observe(parent);
    }
    this.created = true;
    this.drawBackdrop();
    this.buildActors();
    this.syncOverlay();
    this.describe();
    if (this.currentHint !== (this.world?.text.hint ?? '')) { this.currentHint = this.world?.text.hint ?? ''; this.onHint(this.currentHint); }
    this.input.on('pointerup', () => (document.activeElement as HTMLElement | null)?.blur());
    if (this.covered) this.scheduleSleep();
    if (this.world && this.builtKey !== keyOf(this.world, this.cast)) this.scene.restart({ world: this.world, cast: this.cast });
  }

  /** Backdrop: wall and floor colour over the whole game area, panels tiled across it, props at chosen widths, the animated fireplace and sconces. */
  private drawBackdrop() {
    this.backdrop.forEach(o => o.destroy());
    this.backdrop = [];
    this.effects = [];
    const { width: gw, height: gh, offsetX, offsetY } = this.layout;
    const left = -offsetX, top = -offsetY, right = gw - offsetX, bottom = gh - offsetY;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.backdrop.push(o); return o; };
    const depth = (n: number) => DEPTH.backdrop + n;
    const wall = this.add.rectangle(left, top, right - left, 300 - top, WALL).setOrigin(0, 0).setDepth(depth(0));
    const floor = this.add.rectangle(left, 300, right - left, bottom - 300, FLOOR).setOrigin(0, 0).setDepth(depth(0.01));
    add(wall); add(floor);
    const prop = (name: string, x: number, y: number, w: number, d: number) => {
      if (!this.textures.exists(roomKey(name))) return;
      const image = this.add.image(x, y, roomKey(name)).setOrigin(0, 0).setDepth(depth(d));
      image.setScale(w / image.width);
      add(image);
    };
    // Panels tile in both directions: wall rows climb from y 40 to the canvas top, floor rows descend from y 340 to its bottom.
    const rowH = (name: string) => (this.textures.exists(roomKey(name)) ? this.textures.get(roomKey(name)).getSourceImage().height * 256 / this.textures.get(roomKey(name)).getSourceImage().width : 256);
    const wallH = rowH('wall-panel'), floorH = rowH('floor-panel');
    for (let x = Math.floor(left / 256) * 256; x < right; x += 256) {
      for (let y = 40; y + wallH > top; y -= wallH) prop('wall-panel', x, y, 256, 0.02);
      for (let y = 340; y < bottom; y += floorH) prop('floor-panel', x, y, 256, 0.03);
    }
    prop('bookcase', 35, 80, 140, 0.04);
    prop('window', 520, 58, 205, 0.04);
    prop('plant', 8, 208, 75, 0.04);
    // The effect strips were baked with the fixture at an inset inside each 256 px frame: place the frame so the fixture lands on its spot.
    const { room } = this.animations();
    const effect = (name: string, x: number, y: number, inset: number, insetY: number, fixture: number, baked: number, phase: number, d: number) => {
      const anim = room[name];
      if (!anim || !this.textures.exists(roomKey(anim.image.replace(/\.png$/, '')))) return;
      const key = roomKey(anim.image.replace(/\.png$/, ''));
      this.addFrames(anim.image, anim.frames, key);
      const s = fixture / baked;
      const sprite = this.add.sprite(x - inset * s, y - insetY * s, key, 'f0').setOrigin(0, 0).setScale(s).setDepth(depth(d));
      add(sprite);
      this.effects.push({ sprite, frames: anim.frames, image: key, elapsed: phase, frame: 0 });
    };
    effect('fireplace', 1050, 110, 25, 32, 210, 206, 0, 0.05);
    effect('sconce', 410, 85, 78, 55, 55, 100, 0, 0.05);
    effect('sconce', 818, 85, 78, 55, 55, 100, 290, 0.05);
    const t = table();
    if (this.textures.exists(roomKey('roundtable-fullscreen'))) {
      this.tableImage = this.add.image(t.x, t.y, roomKey('roundtable-fullscreen')).setOrigin(0, 0).setDisplaySize(t.width, t.height).setDepth(t.depth);
      add(this.tableImage);
    }
    this.drawTableProps(add);
  }

  /**
   * Table props in small groups with clear table between them: a deck and a discard pile with two dice in the
   * middle, two face-down cards at each friend's place, a few drinks and a low cookie plate.
   * Flat cards lie in the table plane: a container foreshortened by TILT holds them, rotated within the plane.
   * Cups (2x) and cookies (1x) stand upright at whole-pixel scales; dice stand at 0.75 and cards are rotated and
   * foreshortened, so both drop some source pixels (nearest sampling, never blurred). Every prop has a short contact shadow and draws
   * above the table and below the near chairs and actors; nearer props overlap farther ones.
   */
  private drawTableProps(add: <T extends Phaser.GameObjects.GameObject>(object: T) => T) {
    const has = (name: string) => this.textures.exists(`tabletop:${name}`);
    const depth = (y: number, d: number) => DEPTH.table + d + y / 10000;
    const SHADOW = 0x1a0f0a;
    /** Cards at table point (u, v): [name, plane dx, plane dy, angle in the plane]. */
    const flat = (u: number, v: number, cards: [string, number, number, number][]) => {
      const p = tablePoint(u, v);
      const group = this.add.container(Math.round(p.x), Math.round(p.y)).setScale(1, TILT).setDepth(depth(p.y, 2));
      for (const [name, dx, dy, angle] of cards) {
        if (!has(name)) continue;
        // The card's own shadow falls on whatever lies under it, a card lower in the pile included.
        group.add(this.add.image(dx - 1, dy + 3, `tabletop:${name}`).setScale(CARD_SCALE).setAngle(angle).setTintFill(SHADOW).setAlpha(0.3));
        group.add(this.add.image(dx, dy, `tabletop:${name}`).setScale(CARD_SCALE).setAngle(angle));
      }
      add(group);
    };
    /** An upright prop standing at table point (u, v); `foot` is its lowest drawn row over its height. */
    const upright = (name: string, u: number, v: number, scale: number, foot: number, shadow: number) => {
      if (!has(name)) return;
      const p = tablePoint(u, v), x = Math.round(p.x), y = Math.round(p.y);
      add(this.add.ellipse(x - 1, y + 1, shadow, Math.max(3, Math.round(shadow * TILT * 0.55)), SHADOW, 0.32).setDepth(depth(y, 1)));
      add(this.add.image(x, y, `tabletop:${name}`).setOrigin(0.5, foot).setScale(scale).setDepth(depth(y, 2)));
    };
    // Middle: a squared deck (each card a little higher), a loose discard pile, two dice beside them.
    flat(0.02, -0.1, [['card_back', 0, 0, -4], ['card_back', 0, -3, -2], ['card_back', 1, -6, -5], ['card_back', 0, -9, -3]]);
    flat(0.19, -0.02, [['card_diamonds_07', -6, 2, -14], ['card_spades_K', 4, -2, 9], ['card_hearts_A', 0, -4, 23]]);
    upright('dice_3', -0.14, 0.1, 0.75, 27 / 32, 16);
    upright('dice_5', -0.09, 0.16, 0.75, 27 / 32, 16);
    // Two face-down cards at each place, fanned a little and pointing at their owner.
    for (const [u, v] of PLACES) {
      const angle = (Math.atan2(-u, v) * 180) / Math.PI;
      flat(u, v, [['card_back', -5, 0, angle - 9], ['card_back', 5, -2, angle + 7]]);
    }
    // Personal drinks next to some of the hands, standing upright.
    for (const [name, u, v] of DRINKS) upright(name, u, v, 2, 20 / 24, 26);
    // A low shared plate of cookies, nearer the open side of the table.
    const plate = tablePoint(-0.05, 0.42), px = Math.round(plate.x), py = Math.round(plate.y);
    add(this.add.ellipse(px - 2, py + 3, 76, Math.round(76 * TILT), SHADOW, 0.3).setDepth(depth(py, 1)));
    add(this.add.ellipse(px, py, 72, Math.round(72 * TILT), 0x8c7a63).setDepth(depth(py, 1.5)));
    add(this.add.ellipse(px, py - 1, 60, Math.round(60 * TILT), 0xd9ccb2).setDepth(depth(py, 1.6)));
    for (const [dx, dy] of [[-13, 0], [3, -3], [15, 3], [-2, 5]]) {
      if (!has('cookie')) break;
      add(this.add.image(px + dx, py + dy, 'tabletop:cookie').setOrigin(0.5, 19 / 24).setDepth(depth(py + dy, 2)));
    }
  }

  private buildActors() {
    const present = new Set(['player', ...this.cast.map(c => c.id)]);
    const names = new Map(this.cast.map(c => [c.id, c.name]));
    this.overlay?.replaceChildren();
    seats().filter(seat => present.has(seat.actor)).forEach((seat, index) => {
      const built = this.buildRig(seat.actor);
      const initial = actorAnimation(seat.actor, 'idle');
      const piece = (d: number) => this.add.sprite(seat.x, seat.y, rigKey(seat.actor), built ? 'idle' : undefined)
        .setOrigin(ANCHOR.x, ANCHOR.y).setScale(seat.scale).setFlipX(seat.mirror).setDepth(seat.depth + d).setVisible(built);
      // The head draws over the torso and the torso over the base: a piece that moves down covers the seam, never opens it.
      const base = piece(0), sprite = piece(0.01), head = piece(0.02);
      const hit = this.add.zone(seat.x, seat.y, 1, 1).setOrigin(0, 0).setDepth(seat.depth + 0.03);
      const view: ActorView = {
        id: seat.actor, name: seat.actor === 'player' ? 'You' : names.get(seat.actor) ?? seat.actor, layer: seat.layer,
        state: 'idle', key: initial.key, fallback: initial.fallback, sprite, head, base, hit, seat,
        elapsed: 0, offset: index * PHASE_MS, talkMs: 0, thinking: false, motion: STILL, face: '',
      };
      this.actors.set(seat.actor, view);
      this.chair(seat);
      this.pose(view, STILL);
      this.tag(view);
      if (seat.actor !== 'player') this.makeClickable(view);
    });
  }

  /** RGBA pixels of one 192x288 frame of a loaded strip, or null while it is missing. */
  private framePixels(image: string, frame: number): Pixels | null {
    const key = textureKey(image);
    if (!this.textures.exists(key)) return null;
    const source = this.textures.get(key).getSourceImage() as CanvasImageSource;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME.width; canvas.height = FRAME.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, frame * FRAME.width, 0, FRAME.width, FRAME.height, 0, 0, FRAME.width, FRAME.height);
    return { data: ctx.getImageData(0, 0, FRAME.width, FRAME.height).data, width: FRAME.width, height: FRAME.height };
  }

  /** The state's one body drawing: a strip frame, or Sam's seated rig composed from his drawing and the player's legs. */
  private bodyPixels(rig: StateRig): Pixels | null {
    if ('sam' in rig.source) {
      const sam = this.framePixels(`sam-${rig.source.sam}.png`, 0);
      const legs = this.framePixels('player-seated-idle.png', 0);
      return sam && legs ? composeSeatedSam(sam, legs, SAM_RIG.parts[rig.source.sam]) : null;
    }
    return this.framePixels(rig.source.image, rig.source.frame);
  }

  /**
   * Builds the actor's rig texture once per game: per state the body drawing, a blink painted from its own eyes,
   * and for talk a closed mouth painted from its own mouth. Returns false when the strips have not loaded.
   */
  private buildRig(actor: string): boolean {
    const rig = RIG[actor];
    if (!rig) return false;
    const key = rigKey(actor);
    if (this.textures.exists(key)) return this.bounds.has(actor) || this.measure(actor);
    const frames: { name: string; pixels: Pixels }[] = [];
    for (const state of RIG_STATES) {
      const st = rig.states[state];
      const body = this.bodyPixels(st);
      if (!body) return false;
      const blink = paintBlink(body, st.eyes, rig.lash, st.skin);
      const closed = st.mouth ? paintClosedMouth(body, st.mouth, rig.lip) : null;
      for (const name of rigFrames(state)) {
        let pixels = body;
        if (name.includes(':blink')) pixels = applyOverlay(pixels, blink);
        if (name.includes(':closed') && closed) pixels = applyOverlay(pixels, closed);
        frames.push({ name, pixels });
      }
    }
    const texture = this.textures.createCanvas(key, FRAME.width, FRAME.height * frames.length);
    if (!texture) return false;
    const ctx = texture.getContext();
    frames.forEach(({ name, pixels }, i) => {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), FRAME.width, FRAME.height), 0, i * FRAME.height);
      texture.add(name, 0, 0, i * FRAME.height, FRAME.width, FRAME.height);
    });
    texture.refresh();
    return this.measure(actor);
  }

  /** Opaque bounds of each state drawing, read back from the rig texture (built in this game, possibly by an earlier scene run). */
  private measure(actor: string): boolean {
    const texture = this.textures.get(rigKey(actor)) as Phaser.Textures.CanvasTexture;
    if (!texture?.getContext) return false;
    const ctx = texture.getContext();
    const rows = RIG[actor]!.visibleRows;
    const out = {} as Record<RigState, Box | null>;
    for (const state of RIG_STATES) {
      const frame = texture.get(state);
      const data = ctx.getImageData(frame.cutX, frame.cutY, FRAME.width, FRAME.height).data;
      out[state] = opaqueBounds({ data, width: FRAME.width, height: FRAME.height }, 0, rows);
    }
    this.bounds.set(actor, out);
    return true;
  }

  /** A room-pixel rectangle of frame box `b` for this seat, with the state's registration applied. */
  private worldBox(view: ActorView, b: Box): { x0: number; y0: number; x1: number; y1: number } {
    const { seat } = view, s = seat.scale;
    const [rx, ry] = RIG[view.id]!.states[view.state].register;
    const ox = seat.x + rx * s * (seat.mirror ? -1 : 1), oy = seat.y + ry * s;
    const px = (fx: number) => (seat.mirror ? ox - (fx - FRAME.width * ANCHOR.x) * s : ox + (fx - FRAME.width * ANCHOR.x) * s);
    const xa = px(b[0]), xb = px(b[2]);
    return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: oy + (b[1] - FRAME.height * ANCHOR.y) * s, y1: oy + (b[3] - FRAME.height * ANCHOR.y) * s };
  }

  private chair(seat: Seat) {
    const spec = chairs().find(c => c.actor === seat.actor);
    if (!spec || !this.textures.exists(roomKey(spec.image))) return;
    const image = this.add.image(spec.x, spec.y, roomKey(spec.image)).setOrigin(0.5, 1);
    image.setScale(spec.width / image.width).setDepth(spec.depth);
  }

  /**
   * The click target covers the drawn body of the current pose plus HIT_PAD. For a friend behind the table its lower
   * edge follows the table's far edge, sampled across the target's whole width, so no point of the tabletop is in it.
   */
  private fitHit(view: ActorView) {
    const b = this.bounds.get(view.id)?.[view.state];
    if (!b) { view.hit.setSize(1, 1); return; }
    const r = this.worldBox(view, b);
    const x0 = Math.round(r.x0 - HIT_PAD), x1 = Math.round(r.x1 + HIT_PAD), y0 = Math.round(r.y0 - HIT_PAD);
    const bottom = r.y1 + HIT_PAD;
    const floor = (x: number) => Math.max(y0 + 1, view.layer === 'far' ? Math.min(bottom, farEdge(x)) : bottom);
    const points = [new Phaser.Math.Vector2(0, 0), new Phaser.Math.Vector2(x1 - x0, 0)];
    let lowest = y0 + 1;
    for (let i = HIT_STEPS; i >= 0; i--) {
      const x = x0 + ((x1 - x0) * i) / HIT_STEPS, y = floor(x);
      lowest = Math.max(lowest, y);
      points.push(new Phaser.Math.Vector2(x - x0, y - y0));
    }
    view.hit.setPosition(x0, y0).setSize(Math.max(1, x1 - x0), Math.max(1, Math.ceil(lowest) - y0));
    view.hitShape = new Phaser.Geom.Polygon(points);
    if (view.hit.input) { view.hit.input.hitArea = view.hitShape; view.hit.input.hitAreaCallback = Phaser.Geom.Polygon.Contains; }
  }

  private makeClickable(view: ActorView) {
    if (view.hitShape) view.hit.setInteractive(view.hitShape, Phaser.Geom.Polygon.Contains);
    else view.hit.setInteractive();
    view.hit.on('pointerdown', () => { if (this.enabled) this.onArrival(view.id); });
    view.hit.on('pointerover', () => {
      if (!this.enabled) return;
      this.game.canvas.style.cursor = 'pointer';
      this.setHint(plain('roundtable.click', { name: view.name }));
    });
    view.hit.on('pointerout', () => {
      this.game.canvas.style.cursor = '';
      this.setHint(this.world?.text.hint ?? '');
    });
  }

  private setHint(hint: string) {
    if (hint === this.currentHint) return;
    this.currentHint = hint;
    this.onHint(hint);
  }

  private describe() {
    const names = this.cast.map(c => c.name).join(', ');
    const place = this.world?.text.place ?? plain('worlds.friends.place');
    this.game.canvas.setAttribute('aria-label', plain('roundtable.canvas', { place, names }));
    this.game.canvas.setAttribute('role', 'img');
  }

  // ---- state ----

  /** The state an actor should show now: talking beats thinking beats idle. Swaps to that state's one drawing when it changes. */
  private applyState(view: ActorView) {
    const next: ActorState = view.talkMs > 0 ? 'talk' : view.thinking ? 'think' : 'idle';
    if (next === view.state) return;
    const a = actorAnimation(view.id, next);
    view.state = next;
    view.key = a.key;
    view.fallback = a.fallback;
    view.elapsed = 0;
    this.pose(view, STILL);
  }

  /**
   * Draws the actor's current state: the three row bands of its one drawing, placed with the state's registration
   * so the head stays where it was (a near seat's base band on its seat registration, so the feet stay too);
   * the torso and head drop by the motion's pixels; the head shows the face variant.
   */
  private pose(view: ActorView, motion: Motion) {
    const rig = RIG[view.id];
    if (!rig || !this.textures.exists(rigKey(view.id)) || !this.bounds.has(view.id)) return;
    const st = rig.states[view.state];
    const face = faceFrame(view.state, motion.blink, motion.mouthOpen);
    const s = view.seat.scale, dir = view.seat.mirror ? -1 : 1;
    const x = Math.round(view.seat.x + st.register[0] * s * dir);
    const y = Math.round(view.seat.y + st.register[1] * s);
    const base = st.baseRegister ?? st.register;
    const bx = Math.round(view.seat.x + base[0] * s * dir), by = Math.round(view.seat.y + base[1] * s);
    const band = (sprite: Phaser.GameObjects.Sprite, frame: string, from: number, to: number) => {
      if (sprite.frame.name !== frame) sprite.setFrame(frame);
      const rows = Math.max(0, Math.min(to, rig.visibleRows) - from);
      sprite.setCrop(0, from, FRAME.width, Math.max(1, rows)).setVisible(rows > 0);
    };
    // Each upper band reaches one row into the band below and draws over it: at equal offsets the rows are identical,
    // and the overlap closes the hairline a shared crop edge can leave when the scaled quads are rasterised.
    if (view.base.frame.name !== view.state || view.face === '') {
      band(view.base, view.state, st.chest, rig.visibleRows);
      band(view.sprite, view.state, st.neck, st.chest + 1);
      this.fitHit(view);
    }
    if (view.face !== face) { band(view.head, face, 0, st.neck + 1); view.face = face; }
    view.base.setPosition(bx, by);
    view.sprite.setPosition(x, y + motion.torso);
    view.head.setPosition(x, y + motion.head);
    view.motion = motion;
  }

  focus(id: string | null) {
    this.focusId = id;
    this.overlay?.querySelectorAll('.roundtable-tag').forEach(el => el.classList.toggle('active', (el as HTMLElement).dataset.actor === id));
  }

  /** The friend thinks until think(null); you talk for a moment, as you are the one who asked. */
  think(id: string | null) {
    this.actors.forEach(v => { v.thinking = false; });
    const view = id ? this.actors.get(id) : undefined;
    if (view && view.id !== 'player') {
      view.thinking = true;
      const player = this.actors.get('player');
      if (player) player.talkMs = PLAYER_TALK_MS;
    }
    this.actors.forEach(v => this.applyState(v));
  }

  /** The friend talks for 1.5 s plus 60 ms per word, between 2 and 8 s. */
  speak(id: string, text: string) {
    const view = this.actors.get(id);
    if (!view) return;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    view.thinking = false;
    view.talkMs = Math.min(8000, Math.max(2000, 1500 + 60 * words));
    this.applyState(view);
    this.wake();
  }

  /**
   * speak + one speech bubble above the friend; text goes in with textContent only.
   * The bubble shows the whole lines that fit under the HUD and ends with an ellipsis; the thread has the full line.
   */
  say(id: string, text: string) {
    const view = this.actors.get(id);
    if (!view || !this.overlay) return;
    this.speak(id, text);
    // A bubble that replaces the same friend's bubble (a typed talk line) keeps still instead of popping in again.
    const same = Boolean(this.overlay.querySelector(`.roundtable-bubble[data-actor="${CSS.escape(id)}"]`));
    this.clearBubbles();
    const el = document.createElement('div');
    el.className = 'roundtable-bubble';
    el.dataset.actor = id;
    if (same) el.style.animation = 'none';
    const inner = document.createElement('span');
    inner.textContent = text;
    el.append(inner);
    const { bottom, lines } = this.bubbleBox(view);
    el.dataset.lines = String(lines);
    const place = (width: number) => Object.assign(el.style, {
      width: `calc(var(--u) * ${width})`, left: `${bubbleX(view.seat.x, width, ROOM.width) / ROOM.width * 100}%`,
    });
    Object.assign(el.style, {
      position: 'absolute', transform: 'translateX(-50%)', overflowWrap: 'anywhere', pointerEvents: 'none',
      bottom: `${(ROOM.height - bottom) / ROOM.height * 100}%`,
    });
    Object.assign(inner.style, { display: '-webkit-box', webkitBoxOrient: 'vertical', webkitLineClamp: String(lines), overflow: 'hidden' });
    place(BUBBLE.narrow);
    this.overlay.append(el);
    // Text cut short at the narrow width: widen the bubble so more of the line shows.
    if (inner.scrollHeight > inner.clientHeight + 1) place(BUBBLE.wide);
  }

  clearBubbles() { this.overlay?.querySelectorAll('.roundtable-bubble').forEach(el => el.remove()); }

  /** Where name tags and bubbles hang from: 18 source rows above the drawn top of the idle pose (the frame top for all but Sam's rig). */
  private headTop(view: ActorView) {
    const top = this.bounds.get(view.id)?.idle?.[1] ?? 18;
    return view.seat.y - (FRAME.height * ANCHOR.y - top + 18) * view.seat.scale;
  }

  /**
   * The bubble sits above the name tag and never reaches under the top bar. Room pixels.
   * `top` is measured from the label layer itself, so it holds however the canvas is letterboxed;
   * it may be negative when the wall shows above the room. Compact: the stage box clips at the room top.
   */
  private bubbleBox(view: ActorView) {
    const anchor = this.headTop(view) - 34;
    const box = this.overlay!.getBoundingClientRect();
    const u = box.height ? box.height / ROOM.height : 1;
    const bar = document.querySelector('.topbar')?.getBoundingClientRect();
    const top = matchMedia(COMPACT_QUERY).matches ? 0 : (Math.max(HUD_CLEAR, bar ? bar.bottom + 8 : 0) - box.top) / u;
    return bubbleFit(top, anchor);
  }

  resetPosition() {
    this.clearBubbles();
    this.actors.forEach(v => { v.talkMs = 0; v.thinking = false; this.applyState(v); });
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && this.game?.canvas) this.game.canvas.style.cursor = '';
  }

  /** True while a cover hides the scene: poses snap to frame 0 and the render loop sleeps after one more render. */
  setCovered(covered: boolean) {
    this.covered = covered;
    if (covered) {
      if (!this.created) return; // create() applies it after its first render
      this.actors.forEach(v => { v.talkMs = 0; v.thinking = false; this.applyState(v); v.elapsed = 0; this.pose(v, STILL); });
      this.effects.forEach(e => { e.elapsed = 0; e.sprite.setFrame('f0'); e.frame = 0; });
      this.scheduleSleep();
    } else {
      this.cancelSleep();
      this.wake();
    }
  }

  private wake() { if (!this.covered) this.game?.loop.wake(); }
  private scheduleSleep() {
    if (this.sleepAfterRender) return;
    this.sleepAfterRender = () => {
      this.sleepAfterRender = undefined;
      if (this.covered && this.created) this.game.loop.sleep();
    };
    this.game.events.once(Phaser.Core.Events.POST_RENDER, this.sleepAfterRender);
  }
  private cancelSleep() {
    if (!this.sleepAfterRender) return;
    this.game.events.off(Phaser.Core.Events.POST_RENDER, this.sleepAfterRender);
    this.sleepAfterRender = undefined;
  }

  update(_time: number, delta: number) {
    // After the loop sleeps, the first delta can be huge: clamp so loops continue instead of jumping.
    const dt = Math.min(Math.max(delta, 0), MAX_DELTA);
    const still = reducedMotion.matches;
    this.actors.forEach(view => {
      if (view.talkMs > 0) { view.talkMs = Math.max(0, view.talkMs - dt); if (view.talkMs === 0) this.applyState(view); }
    });
    const talking = [...this.actors.values()].filter(v => v.state === 'talk').map(v => v.id);
    this.actors.forEach(view => {
      view.elapsed += dt;
      const listening = talking.some(id => id !== view.id);
      this.pose(view, naturalMotion(view.id, view.state, view.elapsed, { phase: view.offset, still, listening, near: view.layer === 'near' }));
    });
    this.effects.forEach(e => {
      e.elapsed += dt;
      const index = still ? 0 : frameAt(e.frames, e.elapsed);
      if (index !== e.frame) { e.frame = index; e.sprite.setFrame(`f${index}`); }
    });
  }

  // ---- overlay ----

  /** The HTML layer over the room rect: --u = one room pixel in CSS pixels. It never takes pointer events. */
  private labelLayer(): HTMLDivElement {
    if (this.overlay) return this.overlay;
    const canvas = this.game.canvas;
    const overlay = this.overlay = document.createElement('div');
    overlay.className = 'roundtable-labels';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, { position: 'absolute', pointerEvents: 'none' });
    canvas.after(overlay);
    const observer = new ResizeObserver(() => this.syncOverlay());
    observer.observe(canvas);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.syncOverlay());
    return overlay;
  }

  private syncOverlay() {
    const canvas = this.game?.canvas;
    if (!canvas) return;
    const overlay = this.labelLayer();
    if (!canvas.clientWidth) return;
    const scale = canvas.clientWidth / this.scale.gameSize.width;
    overlay.style.left = `${canvas.offsetLeft + this.layout.offsetX * scale}px`;
    overlay.style.top = `${canvas.offsetTop + this.layout.offsetY * scale}px`;
    overlay.style.width = `${ROOM.width * scale}px`;
    overlay.style.height = `${ROOM.height * scale}px`;
    overlay.style.setProperty('--u', `${scale}px`);
  }

  private tag(view: ActorView) {
    const el = document.createElement('span');
    el.className = view.id === 'player' ? 'roundtable-tag you' : 'roundtable-tag';
    el.dataset.actor = view.id;
    el.textContent = view.name.toUpperCase();
    if (view.id === this.focusId) el.classList.add('active');
    Object.assign(el.style, {
      position: 'absolute', transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap', pointerEvents: 'none',
      left: `${view.seat.x / ROOM.width * 100}%`, top: `${(this.headTop(view) - 14) / ROOM.height * 100}%`,
    });
    this.labelLayer().append(el);
  }
}

export function createRoundtable(onArrival: (id: string) => void, onHint: (hint: string) => void): Roundtable {
  const scene = new Roundtable(onArrival, onHint);
  const first = fitRoom(window.innerWidth, window.innerHeight, RAIL, matchMedia(COMPACT_QUERY).matches);
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'roundtable', width: first.width, height: first.height, backgroundColor: '#40302b', pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true }, scene: [scene], input: { keyboard: false }, autoFocus: false,
  });
  game.canvas.setAttribute('role', 'img');
  game.canvas.setAttribute('aria-label', plain('roundtable.canvas.default', { place: plain('worlds.friends.place'), names: 'Ector, Perceval, Pellinore, Galahad, Constantine' }));
  return scene;
}
