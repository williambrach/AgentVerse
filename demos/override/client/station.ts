import Phaser from 'phaser';
import type { Character, LocationId } from './types';
import { DetectiveWalk, groveWalk, walkSpec, type WalkDirection, type WalkSpec } from './detective-walk';
import { MonkeyIdle, groveIdle, idleSpec, reskinIdle, type IdleSpec } from './monkey-idle';
import { mirrorStride, sliceAtlas, type Frame } from './atlas';
import { placeholderAtlas } from './placeholder-art';
import { worldFor, type WorldPack } from './worlds';
import { hueShift, faceSheetPlan, SHEET_CAST } from './recolor';

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
const grid = 8;
const width = 480;
const height = 340;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
  private blocked = new Set<string>();
  private route: Point[] = [];
  private destination: string | null = null;
  private marker!: Phaser.GameObjects.Arc;
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

  constructor(onArrival: (location: LocationId) => void, onHint: (hint: string) => void) {
    super('banana-grove');
    this.onArrival = onArrival;
    this.onHint = onHint;
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
    this.blocked = new Set();
    this.route = [];
    this.destination = null;
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
    // Trees form the perimeter; the center stays open for a two-minute visit.
    for (let y = 0; y < height / grid; y++) for (let x = 0; x < width / grid; x++) {
      if (x < 4 || x > 55 || y < 10 || y > 38) this.blocked.add(`${x},${y}`);
    }
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
      // Leave room for both the NPC's feet and the investigator's collision body.
      for (let y = 0; y < height / grid; y++) for (let x = 0; x < width / grid; x++) {
        if (Math.abs(x * grid + 4 - p.x) < 14 && Math.abs(y * grid + 4 - (p.y - 12)) < 10) this.blocked.add(`${x},${y}`);
      }
    });
    this.player = this.physics.add.image(this.stops.briefing.x, this.stops.briefing.y, 'feet').setVisible(false).setCollideWorldBounds(true);
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
    this.marker = this.add.circle(0, 0, 10).setStrokeStyle(2, 0xffeb9b).setVisible(false).setDepth(2);
    this.prompt = this.label(0, 0, '', 'station-prompt');
    this.prompt.hidden = true;
    this.promptKey = '';
    this.game.canvas.setAttribute('aria-label', `${this.world.text.place} with ${this.cast.map(c => c.name).join(', ')} and your ${this.world.text.investigator}. Click ${this.world.text.clickOne}, use the destination buttons, or walk with WASD and arrows.`);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,SPACE', false) as typeof this.keys;
    this.input.keyboard!.removeCapture(['W', 'A', 'S', 'D', 'E', 'SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const hit = Object.entries(this.stops).find(([id, point]) => {
        const sprite = this.npcs.get(id)?.sprite;
        return (sprite && sprite.getBounds().contains(world.x, world.y)) || Phaser.Math.Distance.Between(world.x, world.y, point.x, point.y - 25) < 28;
      });
      if (hit) this.travel(hit[0]);
      else { this.destination = null; this.route = this.findRoute(world); this.marker.setVisible(false); }
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
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(this.world.palette.ground).color).fillRect(0, 0, width, height);
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
    const sync = () => {
      overlay.style.left = `${canvas.offsetLeft}px`;
      overlay.style.top = `${canvas.offsetTop}px`;
      overlay.style.width = `${canvas.clientWidth}px`;
      overlay.style.height = `${canvas.clientHeight}px`;
      overlay.style.setProperty('--u', `${canvas.clientWidth / width}px`);
    };
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    this.scale.on(Phaser.Scale.Events.RESIZE, sync);
    sync();
    return this.labelLayer();
  }
  private typing() { return Boolean(document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')); }
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  resetPosition() {
    this.route = []; this.destination = null;
    this.npcs.forEach(npc => npc.reset());
    if (this.player) {
      (this.player.body as Phaser.Physics.Arcade.Body).reset(this.stops.briefing.x, this.stops.briefing.y);
      this.direction = 'down';
      this.walk.reset(this.player.x, this.player.y);
      this.marker.setVisible(false);
    }
  }
  travel(location: LocationId) {
    const stop = this.stops[location];
    if (!this.player || !this.enabled || !stop) return;
    this.destination = location;
    this.route = this.findRoute(stop);
    this.marker.setPosition(stop.x, stop.y).setVisible(Boolean(this.route.length));
    if (!this.route.length) this.arrive();
  }
  private arrive() {
    const destination = this.destination;
    this.destination = null; this.marker.setVisible(false);
    if (destination && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.stops[destination].x, this.stops[destination].y) < 18) this.onArrival(destination);
  }
  private findRoute(target: Point): Point[] {
    const key = (p: Point) => `${p.x},${p.y}`;
    const start = { x: Math.floor(this.player.x / grid), y: Math.floor(this.player.y / grid) };
    const end = { x: Math.floor(target.x / grid), y: Math.floor(target.y / grid) };
    const queue = [start], previous = new Map<string, Point | null>([[key(start), null]]);
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head];
      if (key(p) === key(end)) {
        const path: Point[] = [];
        let cursor: Point | null = p;
        while (cursor && previous.get(key(cursor))) { path.unshift({ x: cursor.x * grid + 4, y: cursor.y * grid + 4 }); cursor = previous.get(key(cursor))!; }
        return path;
      }
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const next = { x: p.x + dx, y: p.y + dy };
        if (next.x < 0 || next.x >= width / grid || next.y < 0 || next.y >= height / grid || previous.has(key(next)) || this.blocked.has(key(next))) continue;
        previous.set(key(next), p); queue.push(next);
      }
    }
    return [];
  }
  update(time: number, delta: number) {
    if (!this.player) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);
    let dx = 0, dy = 0;
    if (this.enabled && !this.typing()) {
      dx = Number(this.cursors.right.isDown || this.keys.D.isDown) - Number(this.cursors.left.isDown || this.keys.A.isDown);
      dy = Number(this.cursors.down.isDown || this.keys.S.isDown) - Number(this.cursors.up.isDown || this.keys.W.isDown);
      if (dx || dy) { this.route = []; this.destination = null; this.marker.setVisible(false); }
      if (this.route.length && !dx && !dy) {
        // Consume reached waypoints in the same update so the stride does not
        // restart at every grid cell along a click-to-walk route.
        while (this.route.length && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.route[0].x, this.route[0].y) < 2) this.route.shift();
        if (!this.route.length) this.arrive();
        else { dx = this.route[0].x - this.player.x; dy = this.route[0].y - this.player.y; }
      }
      if (dx || dy) { body.setVelocity(dx, dy).velocity.normalize().scale(120); this.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'; }
    }
    this.walk.update(this.player.x, this.player.y, this.direction, Boolean(dx || dy), reducedMotion.matches, delta);
    this.npcs.forEach(npc => npc.update(delta, this.enabled, reducedMotion.matches,
      Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y) < 54));
    this.shadow.setPosition(this.player.x, this.player.y + 1).setDepth(this.player.y - 1);
    this.marker.setAlpha(reducedMotion.matches ? 1 : .65 + Math.sin(time / 220) * .25);
    const near = Object.entries(this.stops).find(([, p]) => Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < 18);
    const hint = near ? `E / SPACE · ${near[1].title}` : this.destination ? `Walking to ${this.stops[this.destination].label.toLowerCase()}…` : this.world.text.hint;
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
export function createStation(onArrival: (location: LocationId) => void, onHint: (hint: string) => void) {
  const scene = new Station(onArrival, onHint);
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'station', width, height, backgroundColor: '#82a75e', pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, physics: { default: 'arcade', arcade: { debug: false } }, audio: { noAudio: true }, scene: [scene], input: { keyboard: true }, autoFocus: false });
  game.canvas.setAttribute('aria-label', 'Banana Grove with Momo, Pip, Nori and your monkey investigator. Click a monkey, use the destination buttons, or walk with WASD and arrows.');
  game.canvas.setAttribute('role', 'img');
  return scene;
}
