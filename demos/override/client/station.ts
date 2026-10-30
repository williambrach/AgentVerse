import Phaser from 'phaser';
import type { Character, LocationId } from './types';
import { DetectiveWalk, groveWalk, walkSpec, type WalkDirection, type WalkSpec } from './detective-walk';
import { MonkeyIdle, groveIdle, idleSpec, reskinIdle, type IdleSpec } from './monkey-idle';
import { mirrorStride, sliceAtlas, type Frame } from './atlas';
import { placeholderAtlas } from './placeholder-art';
import { worldFor, type WorldPack } from './worlds';
import { hueShift, faceSheetPlan, SHEET_CAST } from './recolor';
import { BUBBLE_WIDTH, placeBubble } from './bubble-layout';
import { stageLayout, COMPACT_QUERY, RAIL, WORLD_WIDTH, WORLD_HEIGHT, type StageLayout } from './stage-layout';

type Point = { x: number; y: number };
type Stop = Point & { title: string; label: string };
type ArtKind = 'cast' | 'idle' | 'walk' | 'props';
export type ArtSource = 'file' | 'placeholder';
const artKinds: ArtKind[] = ['cast', 'idle', 'walk', 'props'];
const atlasDims: Record<ArtKind, [number, number]> = { cast: [4, 4], idle: [4, 3], walk: [4, 4], props: [2, 2] };
const groveColors = ['#cf7a4a', '#6e9a5c', '#9a85c2'];
const groveCast: Character[] = ['Momo', 'Pip', 'Nori'].map((name, i) => ({
  id: name.toLowerCase(), name, role: '', room: '', color: groveColors[i], introduction: '', quickQuestion: '',
}));

function buildStops(world: WorldPack, cast: Character[]): Record<string, Stop> {
  const stops: Record<string, Stop> = {
    report: { x: 132, y: 276, title: 'Pick the roles', label: 'YOUR GUESS' },
    briefing: { x: 244, y: 276, title: 'Read the case', label: 'START HERE' },
  };
  cast.forEach((c, slot) => { stops[c.id] = { ...world.slots[slot], title: `Ask ${c.name}`, label: c.name.toUpperCase() }; });
  return stops;
}
const keyOf = (world: WorldPack, cast: Character[]) => `${world.id}|${cast.map(c => c.id).join(',')}`;
function artKeys(world: WorldPack): Record<ArtKind, string> {
  if (world.id === 'grove') return { cast: 'grove-cast', idle: 'monkey-idle', walk: 'detective-walk', props: 'jungle' };
  return { cast: `${world.id}-cast`, idle: `${world.id}-idle`, walk: `${world.id}-walk`, props: `${world.id}-props` };
}
const width = WORLD_WIDTH;
/** CSS pixels from the window top that speech bubbles keep clear: the top bar's bottom (about 84 with a margin). */
const HUD_CLEAR = 84;
const height = WORLD_HEIGHT;
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
  private walk!: DetectiveWalk;
  private shadow!: Phaser.GameObjects.Ellipse;
  private npcs = new Map<string, MonkeyIdle>();
  // Labels and the [E] prompt are HTML over the canvas, so they stay sharp however far the pixel-art canvas is scaled.
  private overlay?: HTMLDivElement;
  private prompt?: HTMLSpanElement;
  private promptKey = '';
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
  // The source image each `-stride` texture was rebuilt from; a different image means it is stale.
  private strideSources = new Map<string, unknown>();
  private towerProps: Record<string, Frame> = {};
  // The source image each recoloured texture was made from; a different image means it is stale.
  private recolorSources = new Map<string, unknown>();
  // Blob URLs of the recoloured face sheets, by world and cast index; kept per world+cast and revoked when replaced.
  private faceSheets = new Map<string, { key: string; url: string }>();

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
    if (this.scale.gameSize.width !== w || this.scale.gameSize.height !== h) this.scale.setGameSize(w, h);
    // FIT measures #station, which the window has already resized: refresh so the canvas follows.
    this.scale.refresh();
    this.cameras?.main?.setScroll(-offsetX, -offsetY);
    this.syncOverlay();
  }

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
    this.stops = buildStops(this.world, this.cast);
    this.created = false;
    this.npcs = new Map();
    this.player = undefined as unknown as Phaser.Physics.Arcade.Image;
    this.currentHint = '';
  }

  preload() {
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
    const [cols, rows] = atlasDims[kind];
    const frames = sliceAtlas(alpha, canvas.width, canvas.height, cols, rows);
    this.slices.set(key, frames);
    return frames;
  }

  create() {
    // configure() ran while loading: restart with the latest values instead of building the old world.
    if (this.builtKey !== keyOf(this.world, this.cast)) { this.scene.restart({ world: this.world, cast: this.cast }); return; }
    const grove = this.world.id === 'grove';
    const keys = artKeys(this.world);
    this.prepareArt();
    this.publishFaces(keys.cast);
    this.cameras.main.setBackgroundColor(this.world.palette.ground);
    this.applyLayout();
    if (!this.resizeBound) {
      this.resizeBound = true;
      window.addEventListener('resize', () => this.applyLayout());
      matchMedia(COMPACT_QUERY).addEventListener('change', () => this.applyLayout());
    }
    if (grove) {
      const jungle = this.textures.get('jungle');
      if (!jungle.has('palm')) {
        jungle.add('palm', 0, 0, 0, 650, 627);
        jungle.add('basket', 0, 680, 75, 520, 552);
        jungle.add('board', 0, 60, 640, 590, 570);
        jungle.add('bell', 0, 680, 650, 560, 560);
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
    this.physics.world.setBounds(32, 76, width - 64, height - 104);
    this.cast.forEach((member, slot) => {
      const id = member.id;
      const p = this.stops[id];
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
      this.label(p.x, p.y - 66, p.label);
    });
    this.player = this.physics.add.image(this.stops.briefing.x, this.stops.briefing.y, 'feet').setVisible(false).setCollideWorldBounds(true);
    this.lastX = this.player.x; this.lastY = this.player.y; this.moving = false;
    this.cast.forEach(({ id }) => { const p = this.stops[id]; const feet = this.physics.add.staticImage(p.x, p.y - 12, 'feet').setVisible(false); this.physics.add.collider(this.player, feet); });
    this.shadow = this.add.ellipse(this.player.x, this.player.y + 1, 22, 6, 0x314c34, .22);
    const walk = grove ? groveWalk : this.measuredWalk(keys.walk);
    this.walk = new DetectiveWalk(this, this.player.x, this.player.y, walk);
    this.avatar = this.walk.sprite;
    (['briefing', 'report'] as const).forEach(id => {
      const p = this.stops[id];
      if (id === 'briefing') { this.label(p.x, p.y + 33, p.label); return; }
      const size = 38;
      this.prop(keys.props, 'board', p.x, p.y - 15, size).setDepth(p.y - 20);
      this.label(p.x, p.y - size - 25, p.label);
    });
    this.prop(keys.props, 'bell', 282, 111, 39).setDepth(95);
    if (grove) this.prop(keys.props, 'basket', 244, 221, 45).setDepth(216);
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
    // configure() may have run while this build was loading.
    if (this.builtKey !== keyOf(this.world, this.cast)) this.scene.restart({ world: this.world, cast: this.cast });
  }

  /** The measured walk; with `strideFix`, the listed rows' step 3 comes from a rebuilt copy of the sheet. */
  private measuredWalk(key: string): WalkSpec {
    const frames = this.framesOf('walk', key);
    const height = this.world.heights?.investigator ?? 46;
    const fix = this.world.strideFix;
    if (!fix || this.placeholders.has(key)) return walkSpec(frames, key, height);
    const fixedKey = `${key}-stride`;
    let fixed = this.slices.get(fixedKey);
    const image = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    if (!fixed || !this.textures.exists(fixedKey) || this.strideSources.get(fixedKey) !== image) {
      const sources = fix.rows.map(row => frames[row * 4 + 1]);
      // The original sheet, plus one strip below it holding the rebuilt frames. The PNG is untouched.
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(image.width, sources.reduce((sum, f) => sum + f.w, 0));
      canvas.height = image.height + Math.max(...sources.map(f => f.h));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
      const rebuilt = frames.slice();
      let x = 0;
      fix.rows.forEach((row, i) => {
        const source = sources[i];
        ctx.putImageData(new ImageData(mirrorStride(rgba, image.width, source, fix.band, fix.halfWidth), source.w, source.h), x, image.height);
        rebuilt[row * 4 + 3] = { ...source, x, y: image.height };
        x += source.w;
      });
      if (this.textures.exists(fixedKey)) this.textures.remove(fixedKey);
      this.textures.addCanvas(fixedKey, canvas);
      this.slices.set(fixedKey, rebuilt);
      this.strideSources.set(fixedKey, image);
      fixed = rebuilt;
    }
    return walkSpec(fixed, fixedKey, height);
  }

  private prop(key: string, name: string, x: number, y: number, size: number) {
    const image = this.add.image(x, y, key, name);
    const frame = this.towerProps[name];
    if (this.world.id === 'grove' || !frame) return image.setOrigin(.5, 1).setDisplaySize(size, size);
    return image.setOrigin(frame.anchorX / frame.w, frame.anchorY / frame.h).setDisplaySize(size * frame.w / frame.h, size);
  }

  private drawClearing() {
    // Beyond the world: ground, speckles and palms, so a wide window shows more grove. Nothing here touches the 480x340 world.
    const far = this.add.graphics().setDepth(-10);
    far.fillStyle(0x82a75e).fillRect(-400, -300, 1280, 940);
    const outer = new Phaser.Math.RandomDataGenerator(['banana-grove-overscan-v1']);
    for (let i = 0; i < 3000; i++) far.fillStyle(outer.pick([0x91b568, 0x769e55, 0x9abd75])).fillRect(-400 + outer.between(0, 319) * 4, -300 + outer.between(0, 234) * 4, 4, 2);
    overscanSpots(outer, 64, 56, 98, 50, true).forEach(([x, y, size]) => this.add.image(x, y, 'jungle', 'palm').setOrigin(.5, 1).setDisplaySize(size, size).setDepth(y));
    const g = this.add.graphics().setDepth(0);
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
    treeSpots.forEach(([x, y, size]) => this.add.image(x, y, 'jungle', 'palm').setOrigin(.5, 1).setDisplaySize(size, size).setDepth(y < 100 ? 5 : y));
  }

  private drawTower() {
    const ground = Phaser.Display.Color.HexStringToColor(this.world.palette.ground).color;
    // Beyond the world: floor, then bookcases in rows, so the margins are never a bare band. Nothing here touches the 480x340 world.
    const far = this.add.graphics().setDepth(-10);
    far.fillStyle(ground).fillRect(-400, -300, 1280, 940);
    const outer = new Phaser.Math.RandomDataGenerator(['wizard-tower-overscan-v1']);
    for (let i = 0; i < 3000; i++) far.fillStyle(outer.pick([0x655d78, 0x544d63, 0x6a6280])).fillRect(-400 + outer.between(0, 319) * 4, -300 + outer.between(0, 234) * 4, 4, 2);
    const propsKey = artKeys(this.world).props;
    overscanSpots(outer, 50, 50, 70, 50, false).forEach(([x, y, size]) => this.prop(propsKey, 'bookshelf', x, y, size).setDepth(y));
    const g = this.add.graphics().setDepth(0);
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
    const { left } = placeBubble(p.x, p.y - 66, BUBBLE_WIDTH) /* anchored on the name label's centre */;
    // With the HUD up the stage fills the window, so the world's top can sit under the top bar (and, at the right, the mode strip): keep the bubble below them.
    const canvas = this.game.canvas;
    const scale = canvas.clientWidth && this.scale.gameSize.width ? canvas.clientWidth / this.scale.gameSize.width : 1;
    const hudClear = matchMedia(COMPACT_QUERY).matches ? 0 : this.hudClearance(scale, left);
    const { bottom, maxHeight, tail } = placeBubble(p.x, p.y - 66, BUBBLE_WIDTH, Math.max(4, hudClear));
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
    const scale = canvas.clientWidth / this.scale.gameSize.width;
    overlay.style.left = `${canvas.offsetLeft + this.layout.offsetX * scale}px`;
    overlay.style.top = `${canvas.offsetTop + this.layout.offsetY * scale}px`;
    overlay.style.width = `${width * scale}px`;
    overlay.style.height = `${height * scale}px`;
    overlay.style.setProperty('--u', `${scale}px`);
  }
  private typing() { return Boolean(document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')); }
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  resetPosition() {
    this.npcs.forEach(npc => npc.reset());
    if (this.player) {
      (this.player.body as Phaser.Physics.Arcade.Body).reset(this.stops.briefing.x, this.stops.briefing.y);
      this.lastX = this.player.x; this.lastY = this.player.y; this.moving = false;
      this.direction = 'down';
      this.walk.reset(this.player.x, this.player.y);
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
    this.lastX = this.player.x; this.lastY = this.player.y;
    if (moved && !this.moving) this.onWalk();
    this.moving = moved;
    this.walk.update(this.player.x, this.player.y, this.direction, Boolean(dx || dy), reducedMotion.matches, delta);
    this.npcs.forEach(npc => npc.update(delta, this.enabled, reducedMotion.matches,
      Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y) < 54));
    this.shadow.setPosition(this.player.x, this.player.y + 1).setDepth(this.player.y - 1);
    const near = Object.entries(this.stops).find(([, p]) => Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < 18);
    const hint = near ? `E / SPACE · ${near[1].title}` : this.world.text.hint;
    if (hint !== this.currentHint) { this.currentHint = hint; this.onHint(hint); }
    const shown = Boolean(near && this.enabled && !this.typing());
    const promptKey = shown ? `${Math.round(this.player.x)},${Math.round(this.player.y)},${near![1].title}` : '';
    if (this.prompt && promptKey !== this.promptKey) {
      this.promptKey = promptKey;
      this.prompt.hidden = !shown;
      if (shown) {
        this.prompt.textContent = `[E] ${near![1].title}`;
        this.prompt.style.left = `${this.player.x / width * 100}%`;
        this.prompt.style.top = `${(this.player.y + 14) / height * 100}%`;
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
