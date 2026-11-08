import type { FigureArt } from './factory-figures.ts';
import type { Walk } from './hall-layout.ts';

export type SlotPoint = { x: number; y: number };
export type FloorProp = { id: string; x: number; y: number };

export interface WorldPack {
  id: string;
  /** Which stage draws this world. Absent: the walking station. */
  scene?: 'roundtable';
  /** threadNote: the thread's footnote when it differs from the default (friends: at the table). */
  text: { place: string; eyebrow: string; day: string; one: string; many: string; castLabel: string; hint: string; oneWithArticle: string; investigator: string; icon: string; threadNote?: string };
  art: { cast: string; idle: string; walk: string; props: string };
  palette: { ground: string; label: string; labelBg: string };
  /** Where the cast stands, by persona index. Five points; the first three are the original layout. */
  slots: SlotPoint[];
  /** Measured art only: on-screen height of the sheet's tallest cast frame and of the investigator, in px. */
  heights?: { cast: number; investigator: number };
  /** Static-pose figures (factory): one image per pose, drawn at figures.scale. */
  figures?: FigureArt;
  /** Factory floor: props by bottom-centre point, and the exit door's foot. */
  floor?: { props: FloorProp[]; exit: { x: number; y: number } };
  /** Where the shared "YOUR GUESS" and "START HERE" stops stand. Absent: the walking worlds' fixed points (132,276) and (244,276). */
  stops?: { report: SlotPoint; briefing: SlotPoint };
  /** Painted backdrop (department): drawn at scale world units per image px, top-left at (x, y); fill beyond it. */
  backdrop?: { url: string; width: number; height: number; scale: number; x: number; y: number; fill: string };
  /** Where the detective may stand (department). */
  walk?: Walk;
  /** Examinable evidence spots by foot point (department). */
  evidence?: { id: string; x: number; y: number }[];
}

const grove: WorldPack = {
  id: 'grove',
  text: { place: 'Banana Grove', eyebrow: 'GROVE', day: 'PICNIC DAY', one: 'monkey', many: 'monkeys', castLabel: 'MONKEY', hint: 'Walk with WASD / arrows. Press E next to a monkey.', oneWithArticle: 'a monkey', investigator: 'monkey investigator', icon: '<path d="M5 4c-2 8 5 16 14 14-6 5-15 1-16-6C2 8 3 5 5 4zm0 0 2-1"/>' },
  art: { cast: '/assets/banana/monkeys.png', idle: '/assets/banana/monkey-idle.png', walk: '/assets/banana/detective-walk.png', props: '/assets/banana/jungle-props.png' },
  palette: { ground: '#82a75e', label: '#40533c', labelBg: '#fff6dd' },
  slots: [{ x: 116, y: 156 }, { x: 364, y: 156 }, { x: 364, y: 268 }, { x: 84, y: 212 }, { x: 404, y: 212 }],
};

const tower: WorldPack = {
  id: 'tower',
  text: { place: 'Wizard Tower', eyebrow: 'TOWER', day: 'POTION DAY', one: 'apprentice', many: 'apprentices', castLabel: 'APPRENTICE', hint: 'Walk with WASD / arrows. Press E next to an apprentice.', oneWithArticle: 'an apprentice', investigator: 'inspector', icon: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>' },
  art: { cast: '/assets/tower/apprentices.png', idle: '/assets/tower/apprentice-idle.png', walk: '/assets/tower/inspector-walk.png', props: '/assets/tower/tower-props.png' },
  palette: { ground: '#5d566e', label: '#3d3550', labelBg: '#f3ecff' },
  slots: [{ x: 116, y: 156 }, { x: 364, y: 156 }, { x: 364, y: 268 }, { x: 84, y: 212 }, { x: 404, y: 212 }],
  // Juniper (tallest, with her hat) at 47 px; the others keep the sheet's proportions. The inspector is
  // 0.96 of Juniper's height on apprentices.png, the sheet that draws all four at one scale.
  heights: { cast: 47, investigator: 45 },
};

const friends: WorldPack = {
  id: 'friends',
  scene: 'roundtable',
  text: { place: 'The Roundtable', eyebrow: 'FRIENDS', day: 'GAME NIGHT', one: 'friend', many: 'friends', castLabel: 'FRIEND', hint: 'Click a friend at the table, or pick one on the left.', oneWithArticle: 'a friend', investigator: 'friend', threadNote: 'They only hear what is said at the table, never your private chats.', icon: '<path d="M4 10h16M6 10v9M18 10v9M3 10c0-3 4-5 9-5s9 2 9 5"/>' },
  art: { cast: '', idle: '', walk: '', props: '' },
  palette: { ground: '#c98f5a', label: '#4a2f1d', labelBg: '#fff0d6' },
  slots: [],
};

const factory: WorldPack = {
  id: 'factory',
  text: { place: 'Brightwell Factory', eyebrow: 'FACTORY', day: 'LAST SHIFT', one: 'worker', many: 'workers', castLabel: 'WORKER', hint: 'Walk with WASD / arrows. Press E next to a worker.', oneWithArticle: 'a worker', investigator: 'detective', icon: '<path d="M3 20V9l6 4V9l6 4V5h3v15zm4-3h2m3 0h2"/>' },
  art: { cast: '', idle: '', walk: '', props: '' },
  palette: { ground: '#6e7780', label: '#2c343b', labelBg: '#e9edf0' },
  slots: [{ x: 110, y: 190 }, { x: 240, y: 200 }, { x: 370, y: 190 }, { x: 150, y: 290 }, { x: 330, y: 290 }],
  figures: {
    base: '/assets/factory/characters',
    props: '/assets/factory/props',
    sprites: { marta: 'worker-01', ama: 'worker-02', vera: 'worker-03', theo: 'worker-04', bruno: 'worker-05' },
    detective: 'detective',
    frame: { w: 192, h: 384 },
    anchor: { x: 96, y: 376 },
    scale: 1 / 6,
    density: 3,
    labelLift: 68,
  },
  // Clear of every worker and prop box: the spawn stands just above the parts bin, the guess point on open floor between Ama, Vera and Bruno.
  stops: { report: { x: 290, y: 245 }, briefing: { x: 240, y: 266 } },
  floor: {
    props: [
      { id: 'conveyor', x: 50, y: 100 },
      { id: 'control-terminal', x: 130, y: 100 },
      { id: 'server-rack', x: 210, y: 100 },
      { id: 'electrical-cabinet', x: 290, y: 100 },
      { id: 'assembly-robot', x: 370, y: 100 },
      { id: 'exit-door', x: 430, y: 100 },
      { id: 'emergency-stop', x: 62, y: 175 },
      { id: 'locker', x: 24, y: 200 },
      { id: 'packing-bench', x: 50, y: 310 },
      { id: 'parts-bin', x: 240, y: 320 },
      { id: 'safety-barrier', x: 430, y: 240 },
      { id: 'shipping-crates', x: 440, y: 322 },
    ],
    exit: { x: 430, y: 100 },
  },
};

const department: WorldPack = {
  id: 'department',
  text: { place: 'Department Hall', eyebrow: 'DEPARTMENT', day: 'FRIDAY MORNING', one: 'colleague', many: 'colleagues', castLabel: 'COLLEAGUE', hint: 'Walk with WASD / arrows. Press E next to a colleague or a piece of evidence.', oneWithArticle: 'a colleague', investigator: 'detective', icon: '<path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm4.5 10.5L20 20"/>' },
  art: { cast: '', idle: '', walk: '', props: '' },
  palette: { ground: '#1b1714', label: '#2b2320', labelBg: '#f6efe4' },
  slots: [{ x: 150, y: 286 }, { x: 330, y: 296 }, { x: 100, y: 214 }, { x: 280, y: 240 }, { x: 365, y: 214 }],
  figures: {
    base: '/assets/department/characters',
    props: '/assets/department/props',
    sprites: { freja: 'phd-01', mikkel: 'phd-02', birgit: 'professor', jonas: 'it-admin', signe: 'department-admin' },
    detective: 'player',
    frame: { w: 192, h: 384 },
    anchor: { x: 96, y: 376 },
    scale: 1 / 6,
    density: 3,
    labelLift: 68,
  },
  backdrop: { url: '/assets/department/department-hall.png', width: 1536, height: 1024, scale: 1 / 3, x: -16, y: 0, fill: '#1b1714' },
  walk: {
    bounds: { x: 40, y: 188, w: 396, h: 138 },
    blocks: [{ x: -16, y: 150, w: 82, h: 62 }, { x: -16, y: 200, w: 74, h: 100 }, { x: -16, y: 282, w: 104, h: 60 }, { x: 386, y: 272, w: 80, h: 70 }, { x: 422, y: 150, w: 80, h: 112 }],
  },
  stops: { report: { x: 216, y: 296 }, briefing: { x: 240, y: 320 } },
  evidence: [
    { id: 'coffee-mug', x: 62, y: 222 }, { id: 'usb-drive', x: 64, y: 262 }, { id: 'torn-document', x: 160, y: 206 }, { id: 'server-tower', x: 218, y: 200 },
    { id: 'access-card', x: 250, y: 214 }, { id: 'cracked-phone', x: 300, y: 192 }, { id: 'laptop', x: 408, y: 262 }, { id: 'keys', x: 372, y: 318 },
  ],
};

const packs: Record<string, WorldPack> = { grove, tower, friends, factory, department };

export function worldFor(id: string | undefined): WorldPack {
  return (id !== undefined && Object.hasOwn(packs, id) ? packs[id] : grove) as WorldPack;
}
