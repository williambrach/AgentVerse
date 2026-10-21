import Phaser from 'phaser';
import type { LocationId } from './types';
import { DetectiveWalk, loadDetectiveWalk, type WalkDirection } from './detective-walk';
import { MonkeyIdle, loadMonkeyIdle } from './monkey-idle';

type Point = { x: number; y: number };
const stops: Record<LocationId, Point & { title: string; label: string }> = {
  momo: { x: 116, y: 156, title: 'Ask Momo', label: 'MOMO' },
  pip: { x: 364, y: 156, title: 'Ask Pip', label: 'PIP' },
  nori: { x: 364, y: 268, title: 'Ask Nori', label: 'NORI' },
  replay: { x: 244, y: 236, title: 'Inspect the banana basket', label: 'BANANA BASKET' },
  evidence: { x: 68, y: 220, title: 'Review your clues', label: 'CLUES' },
  report: { x: 132, y: 276, title: 'Choose your suspect', label: 'YOUR GUESS' },
  briefing: { x: 244, y: 276, title: 'Read the case', label: 'START HERE' },
};
const grid = 8;
const width = 480;
const height = 340;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export class Station extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private avatar!: Phaser.GameObjects.Sprite;
  private walk!: DetectiveWalk;
  private shadow!: Phaser.GameObjects.Ellipse;
  private npcs = new Map<LocationId, MonkeyIdle>();
  private blocked = new Set<string>();
  private route: Point[] = [];
  private destination: LocationId | null = null;
  private marker!: Phaser.GameObjects.Arc;
  private prompt!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private enabled = false;
  private currentHint = '';
  private direction: WalkDirection = 'down';

  constructor(private onArrival: (location: LocationId) => void, private onHint: (hint: string) => void) { super('banana-grove'); }

  preload() {
    loadDetectiveWalk(this);
    loadMonkeyIdle(this);
    this.load.image('jungle', '/assets/banana/jungle-props.png');
  }

  create() {
    const jungle = this.textures.get('jungle');
    jungle.add('palm', 0, 0, 0, 650, 627);
    jungle.add('basket', 0, 680, 75, 520, 552);
    jungle.add('board', 0, 60, 640, 590, 570);
    jungle.add('bell', 0, 680, 650, 560, 560);
    this.drawClearing();
    const foot = this.make.graphics({ x: 0, y: 0 });
    foot.fillStyle(0xffffff).fillRect(0, 0, 12, 8).generateTexture('feet', 12, 8);
    foot.destroy();
    this.physics.world.setBounds(32, 76, width - 64, height - 104);
    // Trees form the perimeter; the center stays open for a two-minute visit.
    for (let y = 0; y < height / grid; y++) for (let x = 0; x < width / grid; x++) {
      if (x < 4 || x > 55 || y < 10 || y > 38) this.blocked.add(`${x},${y}`);
    }
    (['momo', 'pip', 'nori'] as const).forEach(id => {
      const p = stops[id];
      this.add.ellipse(p.x, p.y - 13, 25, 7, 0x314c34, .22).setDepth(p.y - 18);
      const npc = new MonkeyIdle(this, id, p.x, p.y - 12);
      this.npcs.set(id, npc);
      this.label(p.x, p.y - 66, p.label);
      // Leave room for both the NPC's feet and the investigator's collision body.
      for (let y = 0; y < height / grid; y++) for (let x = 0; x < width / grid; x++) {
        if (Math.abs(x * grid + 4 - p.x) < 14 && Math.abs(y * grid + 4 - (p.y - 12)) < 10) this.blocked.add(`${x},${y}`);
      }
    });
    this.player = this.physics.add.image(stops.briefing.x, stops.briefing.y, 'feet').setVisible(false).setCollideWorldBounds(true);
    (['momo', 'pip', 'nori'] as const).forEach(id => { const p = stops[id]; const feet = this.physics.add.staticImage(p.x, p.y - 12, 'feet').setVisible(false); this.physics.add.collider(this.player, feet); });
    this.shadow = this.add.ellipse(this.player.x, this.player.y + 1, 22, 6, 0x314c34, .22);
    this.walk = new DetectiveWalk(this, this.player.x, this.player.y);
    this.avatar = this.walk.sprite;
    (['briefing', 'replay', 'evidence', 'report'] as const).forEach(id => {
      const p = stops[id];
      if (id === 'briefing') { this.label(p.x, p.y + 33, p.label); return; }
      const kind = id === 'replay' ? 'basket' : 'board';
      const size = id === 'replay' ? 45 : 38;
      this.add.image(p.x, p.y - 15, 'jungle', kind).setOrigin(.5, 1).setDisplaySize(size, size).setDepth(p.y - 20);
      this.label(p.x, p.y - size - 25, p.label);
    });
    this.add.image(282, 111, 'jungle', 'bell').setOrigin(.5, 1).setDisplaySize(39, 39).setDepth(95);
    this.marker = this.add.circle(0, 0, 10).setStrokeStyle(2, 0xffeb9b).setVisible(false).setDepth(2);
    this.prompt = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#384d3a', backgroundColor: '#fff5d9', padding: { x: 5, y: 3 } }).setOrigin(.5, 0).setDepth(1000);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,SPACE', false) as typeof this.keys;
    this.input.keyboard!.removeCapture(['W', 'A', 'S', 'D', 'E', 'SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const hit = Object.entries(stops).find(([id, point]) => {
        const sprite = this.npcs.get(id as LocationId)?.sprite;
        return (sprite && sprite.getBounds().contains(world.x, world.y)) || Phaser.Math.Distance.Between(world.x, world.y, point.x, point.y - 25) < 28;
      });
      if (hit) this.travel(hit[0] as LocationId);
      else { this.destination = null; this.route = this.findRoute(world); this.marker.setVisible(false); }
      (document.activeElement as HTMLElement | null)?.blur();
    });
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (this.enabled && !this.typing() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    });
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
    const trees = [[18, 99, 98], [77, 78, 96], [149, 68, 90], [225, 55, 94], [303, 67, 98], [385, 77, 96], [465, 105, 105], [12, 185, 90], [472, 197, 94], [12, 292, 96], [473, 301, 100], [55, 362, 99], [214, 382, 95], [434, 365, 98]];
    trees.forEach(([x, y, size]) => this.add.image(x, y, 'jungle', 'palm').setOrigin(.5, 1).setDisplaySize(size, size).setDepth(y < 100 ? 5 : y));
  }

  private label(x: number, y: number, text: string) {
    return this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '7px', color: '#40533c', backgroundColor: '#fff6dd', padding: { x: 4, y: 3 } }).setOrigin(.5).setDepth(800);
  }
  private typing() { return Boolean(document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')); }
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  resetPosition() {
    this.route = []; this.destination = null;
    this.npcs.forEach(npc => npc.reset());
    if (this.player) {
      (this.player.body as Phaser.Physics.Arcade.Body).reset(stops.briefing.x, stops.briefing.y);
      this.direction = 'down';
      this.walk.reset(this.player.x, this.player.y);
      this.marker.setVisible(false);
    }
  }
  travel(location: LocationId) {
    if (!this.player || !this.enabled) return;
    this.destination = location;
    this.route = this.findRoute(stops[location]);
    this.marker.setPosition(stops[location].x, stops[location].y).setVisible(Boolean(this.route.length));
    if (!this.route.length) this.arrive();
  }
  private arrive() {
    const destination = this.destination;
    this.destination = null; this.marker.setVisible(false);
    if (destination && Phaser.Math.Distance.Between(this.player.x, this.player.y, stops[destination].x, stops[destination].y) < 18) this.onArrival(destination);
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
    const near = Object.entries(stops).find(([, p]) => Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < 18);
    const hint = near ? `E / SPACE · ${near[1].title}` : this.destination ? `Walking to ${stops[this.destination].label.toLowerCase()}…` : 'Click a monkey or use WASD / arrows to explore.';
    if (hint !== this.currentHint) { this.currentHint = hint; this.onHint(hint); }
    this.prompt.setVisible(Boolean(near && this.enabled && !this.typing())).setPosition(this.player.x, this.player.y + 14).setText(near ? `[E] ${near[1].title}` : '');
    if (near && this.enabled && !this.typing() && (Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE))) this.onArrival(near[0] as LocationId);
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
