import Phaser from 'phaser';
import type { Character, LocationId } from './types';
import { DetectiveWalk, groveWalk, walkSpec, type WalkDirection, type WalkSpec } from './detective-walk';
import { MonkeyIdle, groveIdle, idleSpec, reskinIdle, type IdleSpec } from './monkey-idle';
import { sliceAtlas, type Frame } from './atlas';
import { placeholderAtlas, ATLAS_DIMS } from './placeholder-art';
import { worldFor, type WorldPack } from './worlds';
import * as factoryFigures from './factory-figures';
import * as motion from './figure-motion';
import { evidenceKey, type EvidenceMark } from './hall-layout';
import type { Pose } from './factory-figures';
import { hueShift, faceSheetPlan, SHEET_CAST } from './recolor';
import { BUBBLE_WIDTH, placeBubble } from './bubble-layout';
import { stageLayout, COMPACT_QUERY, RAIL, WORLD_WIDTH, WORLD_HEIGHT, type StageLayout } from './stage-layout';

type Point = { x: number; y: number };
type Stop = Point & { title: string; label: string; bare?: boolean };
type ArtKind = 'cast' | 'idle' | 'walk' | 'props';
export type ArtSource = 'file' | 'placeholder';
const artKinds: ArtKind[] = ['cast', 'idle', 'walk', 'props'];
const groveColors = ['#cf7a4a', '#6e9a5c', '#9a85c2'];
const groveCast: Character[] = ['Momo', 'Pip', 'Nori'].map((name, i) => ({
  id: name.toLowerCase(), name, role: '', room: '', color: groveColors[i], introduction: '', quickQuestion: '',
}));

function buildStops(world: WorldPack, cast: Character[], marks: Map<string, EvidenceMark> = new Map()): Record<string, Stop> {
  const stops: Record<string, Stop> = {
    report: { ...(world.stops?.report ?? { x: 132, y: 276 }), title: 'Pick the roles', label: 'YOUR GUESS' },
    briefing: { ...(world.stops?.briefing ?? { x: 244, y: 276 }), title: 'Read the case', label: 'START HERE' },
  };
  cast.forEach((c, slot) => { stops[c.id] = { ...world.slots[slot], title: `Ask ${c.name}`, label: c.name.toUpperCase() }; });
  // Evidence spots are stops too: no name tag, the [E] prompt sits just above the item.
  world.evidence?.forEach(e => { stops[evidenceKey(e.id)] = { x: e.x, y: e.y, title: `Examine ${marks.get(e.id)?.title ?? e.id}`, label: '', bare: true }; });
  return stops;
}
const keyOf = (world: WorldPack, cast: Character[]) => `${world.id}|${cast.map(c => c.id).join(',')}`;
function artKeys(world: WorldPack): Record<ArtKind, string> {
  if (world.id === 'grove') return { cast: 'grove-cast', idle: 'monkey-idle', walk: 'detective-walk', props: 'jungle' };
  return { cast: `${world.id}-cast`, idle: `${world.id}-idle`, walk: `${world.id}-walk`, props: `${world.id}-props` };
}
const walkKey = (sprite: string, i: number) => `factory-${sprite}-walk-${i}`;
const walkSheetKey = (sprite: string) => `factory-${sprite}-walk-sheet`;
const loopKey = (sprite: string, kind: 'idle' | 'talk', i: number) => `factory-${sprite}-${kind}-${i}`;
const poses: Pose[] = ['listening', 'speaking', 'thinking'];
const figureKey = (sprite: string, pose: Pose) => `factory-${sprite}-${pose}`;
const width = WORLD_WIDTH;
/** CSS pixels from the window top that speech bubbles keep clear: the top bar's bottom (about 84 with a margin). */
const HUD_CLEAR = 84;
const height = WORLD_HEIGHT;
const GROUND_SCALE = 4;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
/** The stage for this window: the bare world when compact, otherwise larger than the world with the world offset inside it. */
function windowLayout(): StageLayout {
  if (matchMedia(COMPACT_QUERY).matches) return { width, height, offsetX: 0, offsetY: 0, scale: 1 };
  return stageLayout(window.innerWidth, window.innerHeight, RAIL);
}
/** Candidate props around the world, jittered on a grid, dropped when their box touches the 480x340 world. */
function overscanSpots(random: Phaser.Math.RandomDataGenerator, stepX: number, stepY: number, size: number, halfWidth: number, rows: boolean) {
  const spots: number[][] = [];
  for (let y = -300 + stepY; y <= 640; y += stepY) for (let x = -400; x <= 880; x += stepX) {
    const px = x + random.between(-8, 8) + (rows && Math.round(y / stepY) % 2 ? stepX / 2 : 0), py = y + random.between(-6, 6);
    const touches = px + halfWidth > 0 && px - halfWidth < width && py > 0 && py - size < height;
    if (!touches) spots.push([px, py, size]);
  }
  return spots;
}
const treeSpots = [[18, 99, 98], [77, 78, 96], [149, 68, 90], [225, 55, 94], [303, 67, 98], [385, 77, 96], [465, 105, 105], [12, 185, 90], [472, 197, 94], [12, 292, 96], [473, 301, 100], [55, 362, 99], [214, 382, 95], [434, 365, 98]];
// Bookcases line the tower walls in rows (the grove's palms grow in clumps); the front wall stays open at the start.
const shelfSpots = [
  ...[26, 76, 126, 176, 226, 276, 326, 376, 426, 476].map(x => [x, 84, 70]),
  [18, 170, 70], [18, 250, 70], [462, 170, 70], [462, 250, 70],
  ...[26, 76, 126, 376, 426, 476].map(x => [x, 376, 70]),
];

export class Station extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private avatar!: Phaser.GameObjects.Sprite;
  private walk?: DetectiveWalk;
  private shadow!: Phaser.GameObjects.Ellipse;
  private shadowDepth = NaN;
  private npcs = new Map<string, MonkeyIdle>();
  // Labels and the [E] prompt are HTML over the canvas, so they stay sharp however far the pixel-art canvas is scaled.
  private overlay?: HTMLDivElement;
  private prompt?: HTMLSpanElement;
  private promptKey = '';
  // Each stop's name tag; near a stop, the [E] prompt takes its place so it is clearly that stop's.
  private labels = new Map<string, HTMLSpanElement>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private enabled = false;
  private currentHint = '';
  private direction: WalkDirection = 'down';

  worldId = 'grove';
  artSources: Record<ArtKind, ArtSource> = { cast: 'file', idle: 'file', walk: 'file', props: 'file' };
  private onArrival: (location: LocationId) => void;
  private onHint: (hint: string) => void;
  private onWalk: () => void;
  private layout: StageLayout = windowLayout();
  private resizeBound = false;
  private moving = false;
  private lastX = 0;
  private lastY = 0;
  private world: WorldPack = worldFor('grove');
  private cast: Character[] = groveCast;
  private stops: Record<string, Stop> = buildStops(this.world, this.cast);
  private builtKey = '';
  private created = false;
  private placeholders = new Set<string>();
  private slices = new Map<string, Frame[]>();
  private towerProps: Record<string, Frame> = {};
  // The source image each recoloured texture was made from; a different image means it is stale.
  private recolorSources = new Map<string, unknown>();
  // Blob URLs of the recoloured face sheets, by world and cast index; kept per world+cast and revoked when replaced.
  private faceSheets = new Map<string, { key: string; url: string }>();
  // Pose-image worlds (world.figures): the pose follows think/speak/detective; figure-motion.ts moves it every frame.
  // walkFrom: set while the figure walks off to the exit; its tween moves it then.
  private figs = new Map<string, { img: Phaser.GameObjects.Image; sprite: string; shadow: Phaser.GameObjects.Ellipse; label: HTMLSpanElement; foot: Point; seed: number; pose: Pose; poseSince: number; walkFrom?: Point }>();
  private detectiveImg?: Phaser.GameObjects.Image;
  private detectiveMarker?: HTMLSpanElement;
  private detectivePose: Pose = 'listening';
  private detectivePoseSince = 0;
  private stride: motion.Stride = motion.STANDING;
  private thinkingId: string | null = null;
  private speakingId: string | null = null;
  private speakTimer?: ReturnType<typeof setTimeout>;
  private facing = false;
  // Evidence marks (title, examined) as last told by the page; kept before create and across rebuilds.
  private marks = new Map<string, EvidenceMark>();
  private markers = new Map<string, Phaser.GameObjects.Image>();

  constructor(onArrival: (location: LocationId) => void, onHint: (hint: string) => void, onWalk: () => void = () => {}) {
    super('banana-grove');
    this.onArrival = onArrival;
    this.onHint = onHint;
    this.onWalk = onWalk;
  }

  /** Size the game to the window and put the 480x340 world at its offset; runs on start and on every resize. */
  private applyLayout() {
    this.layout = windowLayout();
    const { width: w, height: h, offsetX, offsetY } = this.layout;
    const d = this.density();
    if (this.scale.gameSize.width !== w * d || this.scale.gameSize.height !== h * d) this.scale.setGameSize(w * d, h * d);
    // FIT measures #station, which the window has already resized: refresh so the canvas follows.
    this.scale.refresh();
    // Dense worlds draw d canvas pixels per world unit: zoom about the top-left so scroll stays in world units.
    if (d !== 1) this.cameras?.main?.setOrigin(0, 0).setZoom(d);
    this.cameras?.main?.setScroll(-offsetX, -offsetY);
    this.syncOverlay();
    this.fitPrompt();
  }

  /** Backdrop worlds: slide the shown [E] prompt sideways so it stays clear of the left rail and inside the canvas. */
  private fitPrompt() {
    const el = this.prompt;
    if (!this.world.backdrop || !el || el.hidden) return;
    el.style.marginLeft = '0px';
    const box = el.getBoundingClientRect(), canvas = this.game.canvas.getBoundingClientRect();
    const rail = document.querySelector('.hud-rail')?.getBoundingClientRect();
    let shift = 0;
    if (rail && rail.right > box.left && rail.left < box.right && rail.top < box.bottom && rail.bottom > box.top) shift = rail.right + 4 - box.left;
    if (box.right + shift > canvas.right) shift = Math.min(shift, 0) + Math.min(0, canvas.right - box.right);
    el.style.marginLeft = `${shift}px`;
  }

  /** Canvas pixels per world unit: 1 for grove and tower, the pack's density for a factory. */
  private density(): number { return this.world.figures?.density ?? 1; }
  /** Name-tag and bubble anchor height above a stop's foot. */
  private lift(): number { return this.world.figures?.labelLift ?? 66; }

  /** Switch world or cast: a no-op when both are unchanged, otherwise the scene restarts. */
  configure(world: WorldPack, cast: Character[]) {
    const next = cast.slice(0, world.slots.length);
    if (keyOf(world, next) === keyOf(this.world, this.cast)) return;
    this.world = world;
    this.cast = next;
    this.worldId = world.id;
    if (this.created) this.scene.restart({ world, cast: next });
  }

  init(data?: { world?: WorldPack; cast?: Character[] }) {
    if (data?.world) this.world = data.world;
    if (data?.cast) this.cast = data.cast.slice(0, this.world.slots.length);
    this.worldId = this.world.id;
    this.builtKey = keyOf(this.world, this.cast);
    this.overlay?.replaceChildren();
    this.labels = new Map();
    this.stops = buildStops(this.world, this.cast, this.marks);
    this.markers = new Map();
    this.created = false;
    this.npcs = new Map();
    this.player = undefined as unknown as Phaser.Physics.Arcade.Image;
    this.currentHint = '';
    clearTimeout(this.speakTimer);
    this.figs = new Map();
    this.detectiveImg = undefined;
    this.detectiveMarker = undefined;
    this.thinkingId = null;
    this.speakingId = null;
    this.detectivePose = 'listening'; this.detectivePoseSince = 0; this.stride = motion.STANDING;
  }

  preload() {
    const art = this.world.figures;
    if (art) {
      // Factory art is plain files, loaded by key; there is no placeholder or recolour path.
      for (const sprite of [...Object.values(art.sprites), art.detective]) {
        for (const pose of poses) this.load.image(figureKey(sprite, pose), factoryFigures.poseUrl(art, sprite, pose));
        const drawn = factoryFigures.drawnOf(art, sprite);
        for (let i = 0; i < drawn.idle; i++) this.load.image(loopKey(sprite, 'idle', i), factoryFigures.loopUrl(art, sprite, 'idle', i));
        for (let i = 0; i < drawn.talk; i++) this.load.image(loopKey(sprite, 'talk', i), factoryFigures.loopUrl(art, sprite, 'talk', i));
      }
      const sheet = art.walkSheet;
      if (sheet) this.load.image(walkSheetKey(art.detective), sheet.url);
      else for (let i = 0; i < (art.walkFrames ?? 0); i++) this.load.image(walkKey(art.detective, i), factoryFigures.walkFrameUrl(art, i));
      this.world.floor?.props.forEach(p => this.load.image(`factory-prop-${p.id}`, factoryFigures.propUrl(art, p.id)));
      const back = this.world.backdrop;
      if (back) {
        this.load.image(`${this.world.id}-backdrop`, back.url);
        const stopNames = factoryFigures.stopPropsOf(art);
        const propNames = [stopNames.briefing, stopNames.report, ...(this.world.evidence ? ['evidence-marker'] : [])];
        for (const name of propNames) this.load.image(`${this.world.id}-${name}`, factoryFigures.propUrl(art, name));
        this.world.evidence?.forEach(e => this.load.image(`${this.world.id}-evidence-${e.id}`, factoryFigures.propUrl(art, e.id)));
      }
      return;
    }
    // A missing file (404, or HTML served by the dev server) fails the load and leaves no
    // texture; create() then draws the placeholder for it.
    const keys = artKeys(this.world);
    // A placeholder would block the loader (it skips keys already in the texture cache) and keep
    // stale colours, so drop it and let the file try again.
    artKinds.forEach(kind => {
      if (!this.placeholders.has(keys[kind])) return;
      this.textures.remove(keys[kind]);
      this.placeholders.delete(keys[kind]);
      this.slices.delete(keys[kind]);
    });
    artKinds.forEach(kind => this.load.image(keys[kind], this.world.art[kind]));
  }

  /** Make sure each of the world's four textures exists: the file, or a code-drawn placeholder. */
  private prepareArt() {
    const keys = artKeys(this.world);
    const colors = this.cast.map(c => c.color);
    artKinds.forEach(kind => {
      const key = keys[kind];
      if (this.textures.exists(key) && !this.placeholders.has(key)) {
        const image = this.textures.get(key).getSourceImage() as { width: number; height: number };
        if (image.width > 0 && image.height > 0) { this.artSources[kind] = 'file'; return; }
        this.textures.remove(key);
        this.slices.delete(key);
      }
      if (!this.placeholders.has(key)) {
        const atlas = placeholderAtlas(kind, kind === 'cast' || kind === 'idle' ? colors : []);
        const canvas = document.createElement('canvas');
        canvas.width = atlas.width; canvas.height = atlas.height;
        canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(atlas.data), atlas.width, atlas.height), 0, 0);
        this.textures.addCanvas(key, canvas);
        this.placeholders.add(key);
      }
      this.artSources[kind] = 'placeholder';
    });
  }

  /** A recoloured copy of texture `key` for the character at `index`: base colour to its own. Reused while the source image is unchanged. */
  private recolored(key: string, index: number): string | null {
    const base = this.cast[index - SHEET_CAST], own = this.cast[index];
    if (!base || !own) return null;
    const newKey = `${key}-rc${index}-${base.color.replace('#', '')}-${own.color.replace('#', '')}`;
    const image = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    if (this.textures.exists(newKey) && this.recolorSources.get(newKey) === image) return newKey;
    const canvas = this.recolorCanvas(image, base.color, own.color);
    // One recoloured copy per world sheet and index: drop copies made for earlier colours so cast changes do not pile up.
    const prefix = `${key}-rc${index}-`;
    for (const old of this.textures.getTextureKeys()) {
      if (old.startsWith(prefix) && old !== newKey) { this.textures.remove(old); this.recolorSources.delete(old); }
    }
    if (this.textures.exists(newKey)) this.textures.remove(newKey);
    this.textures.addCanvas(newKey, canvas);
    this.recolorSources.set(newKey, image);
    return newKey;
  }

  private recolorCanvas(image: CanvasImageSource & { width: number; height: number }, from: string, to: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(hueShift(pixels.data, from, to)), canvas.width, canvas.height), 0, 0);
    return canvas;
  }

  /** The DOM faces for index >= 3 read the recoloured cast sheet from --face-sheet-<world>-<i>; one blob per world+cast.
   *  Other worlds' variables stay published, so a case board preview of that world draws its own sheet. */
  private publishFaces(castKey: string) {
    const root = document.documentElement;
    const image = this.textures.get(castKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
    for (const step of faceSheetPlan(this.world.id, this.cast, this.world.slots.length)) {
      const slot = `${this.world.id}:${step.index}`;
      const known = this.faceSheets.get(slot);
      const stepKey = step.key;
      if (!stepKey) {
        if (known) URL.revokeObjectURL(known.url);
        this.faceSheets.delete(slot);
        root.style.removeProperty(step.name);
        continue;
      }
      if (known?.key === stepKey) { root.style.setProperty(step.name, `url("${known.url}")`); continue; }
      this.recolorCanvas(image, step.from, step.to).toBlob(blob => {
        if (!blob || this.faceSheets.get(slot)?.key === stepKey) return;
        // The cast may have changed while the blob was encoding; only the latest world+cast gets published.
        const now = faceSheetPlan(this.world.id, this.cast, this.world.slots.length).find(s => s.index === step.index);
        if (now?.key !== stepKey) return;
        const url = URL.createObjectURL(blob);
        const old = this.faceSheets.get(slot);
        this.faceSheets.set(slot, { key: stepKey, url });
        root.style.setProperty(step.name, `url("${url}")`);
        if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1000);
      });
    }
  }

  /** Frames measured from the texture's alpha, so regenerated art needs no tuned anchors. */
  private framesOf(kind: ArtKind, key: string): Frame[] {
    const cached = this.slices.get(key);
    if (cached) return cached;
    const image = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    const [cols, rows] = ATLAS_DIMS[kind];
    const frames = sliceAtlas(alpha, canvas.width, canvas.height, cols, rows);
    this.slices.set(key, frames);
    return frames;
  }

  create() {
    // configure() ran while loading: restart with the latest values instead of building the old world.
    if (this.builtKey !== keyOf(this.world, this.cast)) { this.scene.restart({ world: this.world, cast: this.cast }); return; }
    const grove = this.world.id === 'grove';
    const keys = artKeys(this.world);
    const art = this.world.figures;
    if (!art) { this.prepareArt(); this.publishFaces(keys.cast); }
    this.cameras.main.setBackgroundColor(this.world.palette.ground);
    this.applyLayout();
    if (!this.resizeBound) {
      this.resizeBound = true;
      window.addEventListener('resize', () => this.applyLayout());
      matchMedia(COMPACT_QUERY).addEventListener('change', () => this.applyLayout());
    }
    if (art) this.drawFactory();
    else if (grove) {
      const jungle = this.textures.get('jungle');
      if (!jungle.has('palm')) {
        jungle.add('palm', 0, 0, 0, 325, 313.5);
        jungle.add('basket', 0, 340, 37.5, 260, 276);
        jungle.add('board', 0, 30, 320, 295, 285);
        jungle.add('bell', 0, 340, 325, 280, 280);
      }
      this.drawClearing();
    } else {
      const props = this.textures.get(keys.props);
      this.framesOf('props', keys.props).forEach((frame, i) => {
        const name = ['bookshelf', 'cabinet', 'board', 'bell'][i];
        this.towerProps[name] = frame;
        if (!props.has(name)) props.add(name, 0, frame.x, frame.y, frame.w, frame.h);
      });
      this.drawTower();
    }
    if (!this.textures.exists('feet')) {
      const foot = this.make.graphics({ x: 0, y: 0 });
      foot.fillStyle(0xffffff).fillRect(0, 0, 12, 8).generateTexture('feet', 12, 8);
      foot.destroy();
    }
    const bounds = this.world.walk?.bounds;
    if (bounds) this.physics.world.setBounds(bounds.x, bounds.y, bounds.w, bounds.h);
    else this.physics.world.setBounds(32, 76, width - 64, height - 104);
    const blocks = (this.world.walk?.blocks ?? []).map(b => {
      const block = this.physics.add.staticImage(b.x + b.w / 2, b.y + b.h / 2, 'feet').setVisible(false).setDisplaySize(b.w, b.h).refreshBody();
      return block;
    });
    this.cast.forEach((member, slot) => {
      const id = member.id;
      const p = this.stops[id];
      if (art) { this.addFigure(id, p, art, p.label); return; }
      this.add.ellipse(p.x, p.y - 13, 25, 7, 0x314c34, .22).setDepth(p.y - 18);
      // Art follows the persona index: index >= 3 draws index - 3, recoloured from that character's colour to its own.
      const base = slot >= SHEET_CAST ? slot - SHEET_CAST : slot;
      const baseId = this.cast[base]?.id ?? id;
      let spec: IdleSpec;
      if (grove) spec = groveIdle[baseId] ?? Object.values(groveIdle)[base];
      else {
        const sheet = this.framesOf('idle', keys.idle);
        const poses = sheet.slice(base * 4, base * 4 + 4);
        // One scale for the whole sheet keeps the cast's drawn proportions: a tall hat stays taller.
        const tallest = Math.max(...sheet.map(f => f.h));
        spec = idleSpec(poses, keys.idle, (this.world.heights?.cast ?? 46) * Math.max(...poses.map(f => f.h)) / tallest, slot);
      }
      if (slot >= SHEET_CAST) {
        const key = this.recolored(keys.idle, slot);
        if (key) spec = reskinIdle(spec, key, slot);
      }
      // Frame names are per character id; drop any left from an earlier cast so they are re-measured.
      const texture = this.textures.get(spec.textureKey);
      for (let pose = 0; pose < 4; pose++) texture.remove(`${id}-${pose}`);
      const npc = new MonkeyIdle(this, id, p.x, p.y - 12, spec);
      this.npcs.set(id, npc);
      this.labels.set(id, this.label(p.x, p.y - this.lift(), p.label));
    });
    this.player = this.physics.add.image(this.stops.briefing.x, this.stops.briefing.y, 'feet').setVisible(false).setCollideWorldBounds(true);
    this.lastX = this.player.x; this.lastY = this.player.y; this.moving = false;
    this.cast.forEach(({ id }) => { const p = this.stops[id]; const feet = this.physics.add.staticImage(p.x, p.y - (art ? 4 : 12), 'feet').setVisible(false); this.physics.add.collider(this.player, feet); });
    blocks.forEach(b => this.physics.add.collider(this.player, b));
    this.shadowDepth = NaN;
    this.shadow = this.add.ellipse(this.player.x, this.player.y + 1, 22, 6, 0x314c34, .22);
    if (art) this.addDetective(art);
    else {
      const walk = grove ? groveWalk : this.measuredWalk(keys.walk);
      this.walk = new DetectiveWalk(this, this.player.x, this.player.y, walk);
      this.avatar = this.walk.sprite;
    }
    (['briefing', 'report'] as const).forEach(id => {
      const p = this.stops[id];
      // Backdrop worlds put both tags at name-tag height, so the [E] prompt replaces them like a character's.
      if (this.world.backdrop) { this.labels.set(id, this.label(p.x, p.y - this.lift(), p.label)); return; }
      if (id === 'briefing') { this.labels.set(id, this.label(p.x, p.y + 33, p.label)); return; }
      const size = 38;
      if (!art) this.prop(keys.props, 'board', p.x, p.y - 15, size).setDepth(p.y - 20);
      this.labels.set(id, this.label(p.x, p.y - size - 25, p.label));
    });
    if (!art) this.prop(keys.props, 'bell', 282, 111, 39).setDepth(95);
    if (grove && !art) this.prop(keys.props, 'basket', 244, 221, 45).setDepth(216);
    this.prompt = this.label(0, 0, '', 'station-prompt');
    this.prompt.hidden = true;
    this.promptKey = '';
    this.game.canvas.setAttribute('aria-label', `${this.world.text.place} with ${this.cast.map(c => c.name).join(', ')} and your ${this.world.text.investigator}. Walk with WASD or the arrow keys, press E to talk, or use the destination buttons.`);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,SPACE', false) as typeof this.keys;
    this.input.keyboard!.removeCapture(['W', 'A', 'S', 'D', 'E', 'SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.on('pointerdown', () => {
      if (!this.enabled) return;
      (document.activeElement as HTMLElement | null)?.blur();
    });
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (this.enabled && !this.typing() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    });
    this.created = true;
    if (this.covered) this.scheduleSleep();
    // configure() may have run while this build was loading.
    if (this.builtKey !== keyOf(this.world, this.cast)) this.scene.restart({ world: this.world, cast: this.cast });
  }

  /** Factory floor: a flat floor plus the pack's props by bottom-centre, depth-sorted by their foot. */
  private drawFactory() {
    const art = this.world.figures!;
    this.add.rectangle(-400, -300, 1280, 940, Phaser.Display.Color.HexStringToColor(this.world.palette.ground).color).setOrigin(0, 0).setDepth(-10);
    const back = this.world.backdrop;
    if (back) { this.drawBackdrop(art, back); return; }
    this.add.rectangle(0, 0, width, height, 0xffffff, .06).setOrigin(0, 0).setDepth(0);
    this.world.floor?.props.forEach(p => this.add.image(p.x, p.y, `factory-prop-${p.id}`).setOrigin(.5, 1).setScale(art.scale).setDepth(p.y));
    (['briefing', 'report'] as const).forEach(id => this.add.ellipse(this.stops[id].x, this.stops[id].y, 30, 9, 0xffffff, .14).setDepth(1));
  }

  /** A painted hall: the fill beyond the image, the image lowest, then the desk props and the evidence items with their markers. */
  private drawBackdrop(art: NonNullable<WorldPack['figures']>, back: NonNullable<WorldPack['backdrop']>) {
    const id = this.world.id;
    this.add.rectangle(-400, -300, 1280, 940, Phaser.Display.Color.HexStringToColor(back.fill).color).setOrigin(0, 0).setDepth(-9);
    this.add.image(back.x, back.y, `${id}-backdrop`).setOrigin(0, 0).setScale(back.scale).setDepth(-8);
    const prop = (name: string, x: number, y: number, scale: number) => this.add.image(x, y, `${id}-${name}`).setOrigin(.5, 1).setScale(scale).setDepth(y);
    const names = factoryFigures.stopPropsOf(art);
    prop(names.briefing, this.stops.briefing.x, this.stops.briefing.y, 1 / 12);
    prop(names.report, this.stops.report.x, this.stops.report.y, 1 / 12);
    this.world.evidence?.forEach(e => {
      const item = prop(`evidence-${e.id}`, e.x, e.y, 1 / 12);
      const mark = prop('evidence-marker', e.x + item.displayWidth / 2 + 4, e.y, 1 / 24);
      mark.setVisible(!this.marks.get(e.id)?.examined);
      this.markers.set(e.id, mark);
    });
  }

  /** The page's evidence marks: titles for the stops, no marker on examined items. The scene is not rebuilt. */
  evidence(items: EvidenceMark[]) {
    this.marks = new Map(items.map(m => [m.id, m]));
    this.world.evidence?.forEach(e => {
      const stop = this.stops[evidenceKey(e.id)];
      if (stop) stop.title = `Examine ${this.marks.get(e.id)?.title ?? e.id}`;
      this.markers.get(e.id)?.setVisible(!this.marks.get(e.id)?.examined);
    });
    this.currentHint = '';
    // The prompt is cached per stop: a title that arrives while the detective stands at the item must reach it too.
    const prompt = this.prompt, shownStop = prompt && !prompt.hidden ? this.stops[this.promptKey] : undefined;
    if (prompt && shownStop?.bare) prompt.textContent = `[E] ${shownStop.title}`;
  }

  private figureImage(art: NonNullable<WorldPack['figures']>, sprite: string, pose: Pose, x: number, y: number) {
    return this.add.image(x, y, figureKey(sprite, pose)).setOrigin(art.anchor.x / art.frame.w, art.anchor.y / art.frame.h).setScale(art.scale).setDepth(y);
  }

  private addFigure(id: string, p: Point, art: NonNullable<WorldPack['figures']>, text: string) {
    const sprite = art.sprites[id];
    const shadow = this.add.ellipse(p.x, p.y - 1, 25, 7, 0x000000, .25).setDepth(p.y - 1);
    const img = this.figureImage(art, sprite, 'listening', p.x, p.y);
    const label = this.label(p.x, p.y - art.labelLift, text);
    label.dataset.figure = id;
    label.dataset.pose = 'listening';
    this.figs.set(id, { img, sprite, shadow, label, foot: { x: p.x, y: p.y }, seed: motion.seedOf(id), pose: 'listening', poseSince: -motion.POP_MS });
    this.labels.set(id, label);
  }

  /** Name the walk sheet's frames 0..n-1 on its texture, once: the same pivot-centred window in every cell. */
  private addWalkSheetFrames(art: NonNullable<WorldPack['figures']>) {
    const sheet = art.walkSheet, key = walkSheetKey(art.detective);
    if (!sheet || !this.textures.exists(key)) return;
    const texture = this.textures.get(key);
    for (let i = 0; i < sheet.frames; i++) {
      if (texture.has(String(i))) continue;
      const r = factoryFigures.sheetRect(sheet, i);
      texture.add(String(i), 0, r.x, r.y, r.w, r.h);
    }
  }

  /** The texture (and sheet frame) a look names for one sprite. */
  private lookKey(sprite: string, look: motion.Look): { key: string; frame?: number } {
    const t = look.texture;
    if (t.kind === 'pose') return { key: figureKey(sprite, t.pose) };
    if (t.kind === 'walk' && this.world.figures?.walkSheet && sprite === this.world.figures.detective) {
      // A sheet that failed to load has no per-frame files behind it: show the still pose instead.
      return this.textures.exists(walkSheetKey(sprite)) ? { key: walkSheetKey(sprite), frame: t.frame } : { key: figureKey(sprite, this.detectivePose) };
    }
    if (t.kind === 'walk') return { key: walkKey(sprite, t.frame) };
    return { key: loopKey(sprite, t.kind, t.frame) };
  }

  /** Put a look on a figure standing at foot (x, y): whole canvas pixels of stretch and lift, leaning about the feet.
   * A walk-sheet frame keeps the sheet's own pivot and scale; everything else uses the pose frame's. */
  private wear(img: Phaser.GameObjects.Image, sprite: string, look: motion.Look, x: number, y: number) {
    const art = this.world.figures!;
    const { key, frame } = this.lookKey(sprite, look);
    if (img.texture.key !== key) img.setTexture(key, frame);
    else if (frame !== undefined && String(img.frame.name) !== String(frame)) img.setFrame(frame);
    const sheet = frame !== undefined ? art.walkSheet! : undefined;
    const origin = sheet ? factoryFigures.sheetOrigin(sheet, frame) : { x: art.anchor.x / art.frame.w, y: art.anchor.y / art.frame.h };
    const scale = sheet ? sheet.scale : art.scale;
    if (img.originX !== origin.x || img.originY !== origin.y) img.setOrigin(origin.x, origin.y);
    const tall = (sheet ? sheet.cell.h : art.frame.h) * scale * art.density;
    img.setScale(scale, scale * (1 + look.stretch / tall));
    img.setPosition(x, y - look.lift / art.density);
    img.setAngle(img.flipX ? -look.lean : look.lean);
  }

  /** Every standing figure's look for this frame; still poses under reduced motion. */
  private animateFigures(time: number) {
    const art = this.world.figures;
    if (!art) return;
    this.figs.forEach(f => {
      if (f.walkFrom) return;
      const look = reducedMotion.matches ? motion.stillLook(f.pose) : motion.standLook(f.pose, time, f.seed, time - f.poseSince, factoryFigures.drawnOf(art, f.sprite));
      this.wear(f.img, f.sprite, look, f.foot.x, f.foot.y);
    });
  }

  private addDetective(art: NonNullable<WorldPack['figures']>) {
    this.addWalkSheetFrames(art);
    this.detectiveImg = this.figureImage(art, art.detective, this.detectivePose, this.player.x, this.player.y);
    this.shadow.setFillStyle(0x000000, .25);
    // An empty, hidden marker carries the detective's pose beside the name tags.
    const marker = this.detectiveMarker = document.createElement('span');
    marker.hidden = true;
    marker.dataset.figure = 'detective';
    marker.dataset.pose = this.detectivePose;
    this.labelLayer().append(marker);
    this.applyPoses();
  }

  /** Each figure takes the pose the shared state gives it; poses change only through think/speak/detective.
   * A change starts the pose pop; the next frame draws it (animateFigures and update). */
  private applyPoses() {
    const art = this.world.figures;
    if (!art) return;
    const state = { thinking: this.thinkingId, speaking: this.speakingId, typing: false };
    const now = this.time?.now ?? 0;
    this.figs.forEach((f, id) => {
      const pose = factoryFigures.poseFor(state, id);
      if (f.pose === pose) return;
      f.pose = pose;
      f.poseSince = now;
      f.label.dataset.pose = pose;
    });
    if (this.detectiveImg && this.detectiveMarker && this.detectiveMarker.dataset.pose !== this.detectivePose) {
      this.detectivePoseSince = now;
      this.detectiveMarker.dataset.pose = this.detectivePose;
    }
  }

  /** Who is thinking right now (null: nobody). */
  think(id: string | null): void {
    if (!this.world.figures) return;
    this.thinkingId = id;
    this.applyPoses();
  }

  /** `id` shows the speaking pose for as long as `text` takes to read, then goes back to listening. */
  speak(id: string, text: string): void {
    if (!this.world.figures) return;
    clearTimeout(this.speakTimer);
    this.speakingId = id;
    this.applyPoses();
    this.speakTimer = setTimeout(() => { this.speakingId = null; this.applyPoses(); }, factoryFigures.speakMs(text));
  }

  detective(pose: Pose): void {
    this.detectivePose = pose;
    this.applyPoses();
  }

  /** The figure walks to the floor's exit, stepping as it goes, then it and its tag are gone. Works while covered: the loop wakes for the walk. */
  escape(id: string): Promise<void> {
    const f = this.figs.get(id), exit = this.world.floor?.exit, art = this.world.figures;
    if (!f || !exit || !art) return Promise.resolve();
    f.label.hidden = true;
    f.shadow.setVisible(false);
    const from = f.walkFrom = { ...f.foot };
    const done = () => { f.img.setPosition(exit.x, exit.y).setVisible(false); if (this.covered) this.scheduleSleep(); };
    if (reducedMotion.matches) { done(); return Promise.resolve(); }
    this.cancelSleep();
    this.game.loop.wake();
    f.img.setFlipX(exit.x < from.x);
    const at = { x: from.x, y: from.y };
    return new Promise<void>(resolve => {
      this.tweens.add({ targets: at, x: exit.x, y: exit.y, duration: 1400, ease: 'Sine.easeInOut',
        onUpdate: () => {
          const look = motion.walkLook(Math.hypot(at.x - from.x, at.y - from.y), 'listening', factoryFigures.drawnOf(art, f.sprite));
          this.wear(f.img, f.sprite, look, at.x, at.y);
          f.img.setDepth(at.y);
        },
        onComplete: () => { done(); resolve(); } });
    });
  }

  private measuredWalk(key: string): WalkSpec {
    return walkSpec(this.framesOf('walk', key), key, this.world.heights?.investigator ?? 46);
  }

  private prop(key: string, name: string, x: number, y: number, size: number) {
    const image = this.add.image(x, y, key, name);
    const frame = this.towerProps[name];
    if (this.world.id === 'grove' || !frame) return image.setOrigin(.5, 1).setDisplaySize(size, size);
    return image.setOrigin(frame.anchorX / frame.w, frame.anchorY / frame.h).setDisplaySize(size * frame.w / frame.h, size);
  }

  // Ground is baked at 4x so nearest-neighbour sampling keeps edges where the live drawing put them.
  private drawClearing() {
    // Beyond the world: ground, speckles and palms, so a wide window shows more grove. Nothing here touches the 480x340 world.
    // Drawn once into a texture; the Graphics is destroyed, so Phaser replays no commands per frame.
    const farKey = `${this.world.id}-far`;
    const far = this.textures.exists(farKey) ? null : this.add.graphics();
    far?.fillStyle(0x82a75e).fillRect(0, 0, 1280, 940);
    const outer = new Phaser.Math.RandomDataGenerator(['banana-grove-overscan-v1']);
    for (let i = 0; i < 3000; i++) {
      const color = outer.pick([0x91b568, 0x769e55, 0x9abd75]), x = outer.between(0, 319) * 4, y = outer.between(0, 234) * 4;
      far?.fillStyle(color).fillRect(x, y, 4, 2);
    }
    if (far) { far.generateTexture(farKey, 1280, 940); far.destroy(); }
    this.add.image(-400, -300, farKey).setOrigin(0, 0).setDepth(-10);
    overscanSpots(outer, 64, 56, 98, 50, true).forEach(([x, y, size]) => this.add.image(x, y, 'jungle', 'palm').setOrigin(.5, 1).setDisplaySize(size, size).setDepth(y));
    const groundKey = `${this.world.id}-ground`;
    if (!this.textures.exists(groundKey)) {
    const g = this.add.graphics().setScale(GROUND_SCALE);
    g.fillStyle(0x82a75e).fillRect(0, 0, width, height);
    // A fixed seed gives every investigator the same little grove.
    const random = new Phaser.Math.RandomDataGenerator(['banana-grove-v1']);
    for (let i = 0; i < 700; i++) {
      const x = random.between(0, 119) * 4, y = random.between(0, 84) * 4;
      g.fillStyle(random.pick([0x91b568, 0x769e55, 0x9abd75])).fillRect(x, y, 4, 2);
    }
    // Chunky stepped edges read as a handheld-game tile path.
    g.fillStyle(0x719753).fillRoundedRect(42, 86, 396, 226, 48);
    g.fillStyle(0xe1cd91).fillRect(72, 100, 336, 196).fillRect(48, 124, 384, 148).fillRect(96, 84, 288, 220);
    g.fillStyle(0xebdba7).fillRect(80, 108, 320, 180).fillRect(56, 132, 368, 132).fillRect(104, 92, 272, 204);
    for (let i = 0; i < 95; i++) g.fillStyle(0xd0bb7f, .45).fillRect(random.between(75, 405), random.between(110, 284), 2, 1);
    // The stolen bananas ended up at the monkeys' picnic blanket.
    for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) g.fillStyle((x + y) % 2 ? 0xe5af88 : 0xf8e3be).fillRect(205 + x * 12, 190 + y * 10, 12, 10);
    g.lineStyle(2, 0xc98c6e).strokeRect(204, 189, 62, 32);
    g.generateTexture(groundKey, width * GROUND_SCALE, height * GROUND_SCALE);
    g.destroy();
    }
    this.add.image(0, 0, groundKey).setOrigin(0, 0).setDisplaySize(width, height).setDepth(0);
    treeSpots.forEach(([x, y, size]) => this.add.image(x, y, 'jungle', 'palm').setOrigin(.5, 1).setDisplaySize(size, size).setDepth(y < 100 ? 5 : y));
  }

  private drawTower() {
    const ground = Phaser.Display.Color.HexStringToColor(this.world.palette.ground).color;
    // Beyond the world: floor, then bookcases in rows, so the margins are never a bare band. Nothing here touches the 480x340 world.
    const farKey = `${this.world.id}-far`;
    const far = this.textures.exists(farKey) ? null : this.add.graphics();
    far?.fillStyle(ground).fillRect(0, 0, 1280, 940);
    const outer = new Phaser.Math.RandomDataGenerator(['wizard-tower-overscan-v1']);
    for (let i = 0; i < 3000; i++) {
      const color = outer.pick([0x655d78, 0x544d63, 0x6a6280]), x = outer.between(0, 319) * 4, y = outer.between(0, 234) * 4;
      far?.fillStyle(color).fillRect(x, y, 4, 2);
    }
    if (far) { far.generateTexture(farKey, 1280, 940); far.destroy(); }
    this.add.image(-400, -300, farKey).setOrigin(0, 0).setDepth(-10);
    const propsKey = artKeys(this.world).props;
    overscanSpots(outer, 50, 50, 70, 50, false).forEach(([x, y, size]) => this.prop(propsKey, 'bookshelf', x, y, size).setDepth(y));
    const groundKey = `${this.world.id}-ground`;
    if (!this.textures.exists(groundKey)) {
    const g = this.add.graphics().setScale(GROUND_SCALE);
    g.fillStyle(ground).fillRect(0, 0, width, height);
    const random = new Phaser.Math.RandomDataGenerator(['wizard-tower-v1']);
    for (let i = 0; i < 700; i++) {
      const x = random.between(0, 119) * 4, y = random.between(0, 84) * 4;
      g.fillStyle(random.pick([0x655d78, 0x544d63, 0x6a6280])).fillRect(x, y, 4, 2);
    }
    // The lighter flagstone hall sits where the grove path is.
    g.fillStyle(0x474160).fillRoundedRect(42, 86, 396, 226, 48);
    g.fillStyle(0x9a93ae).fillRect(72, 100, 336, 196).fillRect(48, 124, 384, 148).fillRect(96, 84, 288, 220);
    g.fillStyle(0xaaa3bf).fillRect(80, 108, 320, 180).fillRect(56, 132, 368, 132).fillRect(104, 92, 272, 204);
    for (let y = 120; y < 288; y += 24) g.fillStyle(0x8a8399, .55).fillRect(80, y, 320, 1);
    for (let row = 0; row < 7; row++) for (let x = 80 + (row % 2) * 20; x < 400; x += 40) g.fillStyle(0x8a8399, .55).fillRect(x, 108 + row * 24, 1, 24);
    // A round lilac rug where the grove has its blanket.
    g.fillStyle(0x6f5a99).fillEllipse(235, 205, 86, 54);
    g.fillStyle(0xb9a3dc).fillEllipse(235, 205, 76, 44);
    g.lineStyle(2, 0x8d74b8).strokeEllipse(235, 205, 52, 28);
    g.generateTexture(groundKey, width * GROUND_SCALE, height * GROUND_SCALE);
    g.destroy();
    }
    this.add.image(0, 0, groundKey).setOrigin(0, 0).setDisplaySize(width, height).setDepth(0);
    shelfSpots.forEach(([x, y, size]) => this.prop(artKeys(this.world).props, 'bookshelf', x, y, size).setDepth(y < 100 ? 5 : y));
  }

  private label(x: number, y: number, text: string, kind = 'station-label') {
    const overlay = this.labelLayer();
    const el = document.createElement('span');
    el.className = kind;
    el.textContent = text;
    el.style.left = `${x / width * 100}%`;
    el.style.top = `${y / height * 100}%`;
    overlay.append(el);
    return el;
  }

  /** One speech bubble at a time, above a character. Text goes in with textContent only. */
  say(characterId: string, text: string) {
    const p = this.stops[characterId];
    if (!p || !this.cast.some(c => c.id === characterId)) return;
    this.clearBubbles();
    const overlay = this.labelLayer();
    const { left } = placeBubble(p.x, p.y - this.lift(), BUBBLE_WIDTH) /* anchored on the name label's centre */;
    // With the HUD up the stage fills the window, so the world's top can sit under the top bar (and, at the right, the mode strip): keep the bubble below them.
    const canvas = this.game.canvas;
    const scale = canvas.clientWidth && this.scale.gameSize.width ? canvas.clientWidth / this.scale.gameSize.width * this.density() : 1;
    const hudClear = matchMedia(COMPACT_QUERY).matches ? 0 : this.hudClearance(scale, left);
    const { bottom, maxHeight, tail } = placeBubble(p.x, p.y - this.lift(), BUBBLE_WIDTH, Math.max(4, hudClear));
    const el = document.createElement('div');
    el.className = 'station-bubble';
    el.dataset.character = characterId;
    const inner = document.createElement('span');
    inner.textContent = text;
    el.append(inner);
    el.style.left = `${left / width * 100}%`;
    el.style.bottom = `${(height - bottom) / height * 100}%`;
    el.style.setProperty('--max', String(maxHeight));
    // The font is a fixed 15px, so the lines that fit are counted in screen pixels; a longer line ends in an ellipsis.
    el.style.setProperty('--lines', String(Math.max(1, Math.floor((maxHeight - 14) * scale / (15 * 1.3)))));
    el.style.setProperty('--tail', `calc(var(--u) * ${tail})`);
    overlay.append(el);
  }

  /** Game pixels from the world's top that a bubble at `left` must stay below, so it clears the top bar and, if it reaches that far right, the mode strip. */
  private hudClearance(scale: number, left: number): number {
    const bar = document.querySelector('.topbar')?.getBoundingClientRect(), strip = document.querySelector('.mode-strip-body')?.getBoundingClientRect();
    let clear = Math.max(HUD_CLEAR, bar ? bar.bottom + 8 : 0);
    const right = (this.layout.offsetX + left + BUBBLE_WIDTH) * scale;
    if (strip && strip.width && right > strip.left) clear = Math.max(clear, strip.bottom + 4);
    return clear / scale - this.layout.offsetY;
  }

  clearBubbles() { this.overlay?.querySelectorAll('.station-bubble').forEach(el => el.remove()); }

  /** The HTML layer over the canvas: same box as the canvas, with --u = one game pixel in CSS pixels. */
  private labelLayer(): HTMLDivElement {
    if (this.overlay) {
      this.overlay.style.setProperty('--label', this.world.palette.label);
      this.overlay.style.setProperty('--label-bg', this.world.palette.labelBg);
      return this.overlay;
    }
    const canvas = this.game.canvas;
    const overlay = this.overlay = document.createElement('div');
    overlay.className = 'station-labels';
    overlay.setAttribute('aria-hidden', 'true');
    canvas.after(overlay);
    const sync = () => this.syncOverlay();
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    this.scale.on(Phaser.Scale.Events.RESIZE, sync);
    sync();
    return this.labelLayer();
  }
  /** The label layer covers the world rect, not the canvas, so the percentages used for labels still hold. */
  private syncOverlay() {
    const overlay = this.overlay, canvas = this.game?.canvas;
    if (!overlay || !canvas || !canvas.clientWidth) return;
    const scale = canvas.clientWidth / this.scale.gameSize.width * this.density();
    overlay.style.left = `${canvas.offsetLeft + this.layout.offsetX * scale}px`;
    overlay.style.top = `${canvas.offsetTop + this.layout.offsetY * scale}px`;
    overlay.style.width = `${width * scale}px`;
    overlay.style.height = `${height * scale}px`;
    overlay.style.setProperty('--u', `${scale}px`);
  }
  private typing() { return Boolean(document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')); }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) this.hidePrompt(); }
  /** Backdrop worlds: hide the [E] prompt and restore the tag it replaced; the next update shows it again. */
  private hidePrompt() {
    if (!this.world.backdrop || !this.prompt) return;
    this.labels.get(this.promptKey)?.style.removeProperty('visibility');
    this.prompt.hidden = true;
    this.promptKey = '';
  }
  /** True while a cover (intro, overlay, lineup) hides the stage: poses snap to 0 and the render loop sleeps after one more frame. */
  setCovered(covered: boolean): void {
    this.covered = covered;
    if (covered) {
      this.hidePrompt();
      if (!this.created) return; // create() applies it after its first render
      this.npcs.forEach(npc => npc.reset());
      if (this.player) this.walk?.reset(this.player.x, this.player.y);
      this.stride = motion.STANDING;
      this.scheduleSleep();
    } else {
      this.cancelSleep();
      this.game?.loop.wake();
    }
  }
  private sleepAfterRender?: () => void;
  private covered = false;
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
  resetPosition() {
    this.npcs.forEach(npc => npc.reset());
    if (this.player) {
      (this.player.body as Phaser.Physics.Arcade.Body).reset(this.stops.briefing.x, this.stops.briefing.y);
      this.lastX = this.player.x; this.lastY = this.player.y; this.moving = false;
      this.direction = 'down';
      this.walk?.reset(this.player.x, this.player.y);
      this.stride = motion.STANDING;
    }
  }
  update(time: number, delta: number) {
    if (!this.player) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);
    let dx = 0, dy = 0;
    if (this.enabled && !this.typing()) {
      dx = Number(this.cursors.right.isDown || this.keys.D.isDown) - Number(this.cursors.left.isDown || this.keys.A.isDown);
      dy = Number(this.cursors.down.isDown || this.keys.S.isDown) - Number(this.cursors.up.isDown || this.keys.W.isDown);
      if (dx || dy) { body.setVelocity(dx, dy).velocity.normalize().scale(120); this.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'; }
    }
    const moved = Math.abs(this.player.x - this.lastX) + Math.abs(this.player.y - this.lastY) > .01;
    const traveled = Math.hypot(this.player.x - this.lastX, this.player.y - this.lastY);
    this.lastX = this.player.x; this.lastY = this.player.y;
    if (moved && !this.moving) this.onWalk();
    this.moving = moved;
    this.walk?.update(this.player.x, this.player.y, this.direction, Boolean(dx || dy), reducedMotion.matches, delta);
    if (this.detectiveImg) {
      const art = this.world.figures!;
      if (this.direction === 'left' || this.direction === 'right') this.facing = this.direction === 'left';
      // The stride survives render frames without a physics step, so a 120 Hz screen does not flicker between walk and stand.
      this.stride = motion.strideNext(this.stride, traveled, Boolean(dx || dy) && !reducedMotion.matches, delta);
      const drawnArt = factoryFigures.drawnOf(art, art.detective);
      // A walk sheet that failed to load leaves the still pose hopping, as before the sheet.
      const drawn = art.walkSheet && !this.textures.exists(walkSheetKey(art.detective)) ? { ...drawnArt, walk: 0 } : drawnArt;
      const look = reducedMotion.matches ? motion.stillLook(this.detectivePose)
        : this.stride.walking ? motion.walkLook(this.stride.distance, this.detectivePose, drawn, art.walkSheet && { ms: this.stride.ms, frameMs: art.walkSheet.frameMs })
        : motion.standLook(this.detectivePose, time, motion.seedOf('detective'), time - this.detectivePoseSince, drawn);
      this.detectiveImg.setFlipX(this.facing).setDepth(this.player.y);
      this.wear(this.detectiveImg, art.detective, look, this.player.x, this.player.y);
    }
    this.animateFigures(time);
    this.npcs.forEach(npc => npc.update(delta, this.enabled, reducedMotion.matches,
      Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y) < 54));
    this.shadow.setPosition(this.player.x, this.player.y + 1);
    if (this.shadowDepth !== this.player.y - 1) this.shadow.setDepth(this.shadowDepth = this.player.y - 1);
    const near = Object.entries(this.stops).find(([, p]) => Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < 18);
    const hint = near ? `E / SPACE · ${near[1].title}` : this.world.text.hint;
    if (hint !== this.currentHint) { this.currentHint = hint; this.onHint(hint); }
    const shown = Boolean(near && this.enabled && !this.typing());
    // The prompt sits on the stop's own name tag, never under the player, where it could land on a neighbour's tag.
    const promptKey = shown ? near![0] : '';
    if (this.prompt && promptKey !== this.promptKey) {
      this.labels.get(this.promptKey)?.style.removeProperty('visibility');
      this.promptKey = promptKey;
      this.prompt.hidden = !shown;
      const tag = shown && !near![1].bare ? this.labels.get(promptKey) : undefined;
      if (shown) {
        const p = near![1];
        this.prompt.textContent = `[E] ${p.title}`;
        this.prompt.style.left = tag?.style.left ?? `${p.x / width * 100}%`;
        this.prompt.style.top = tag?.style.top ?? `${(p.y - this.lift()) / height * 100}%`;
        tag?.style.setProperty('visibility', 'hidden');
        this.fitPrompt();
      }
    }
    if (near && this.enabled && !this.typing() && (Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE))) this.onArrival(near[0]);
  }
}
export function createStation(onArrival: (location: LocationId) => void, onHint: (hint: string) => void, onWalk: () => void = () => {}) {
  const scene = new Station(onArrival, onHint, onWalk);
  const first = windowLayout();
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'station', width: first.width, height: first.height, backgroundColor: '#82a75e', pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, physics: { default: 'arcade', arcade: { debug: false } }, audio: { noAudio: true }, scene: [scene], input: { keyboard: true }, autoFocus: false });
  game.canvas.setAttribute('aria-label', 'Banana Grove with Momo, Pip, Nori and your monkey investigator. Walk with WASD or the arrow keys, press E to talk, or use the destination buttons.');
  game.canvas.setAttribute('role', 'img');
  return scene;
}
