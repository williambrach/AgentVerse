import type { FigureArt, WalkSheet } from './factory-figures.ts';
import type { Walk } from './hall-layout.ts';
import { plain } from './text.ts';

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
  /** Pose-image figures (factory, department, renaissance): one image per pose, drawn at figures.scale and moved by figure-motion.ts. */
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
  text: { get place() { return plain('worlds.grove.place'); }, get eyebrow() { return plain('worlds.grove.eyebrow'); }, day: "PICNIC DAY", get one() { return plain('worlds.grove.one'); }, get many() { return plain('worlds.grove.many'); }, castLabel: "MONKEY", get hint() { return plain('worlds.grove.hint'); }, get oneWithArticle() { return plain('worlds.grove.oneWithArticle'); }, get investigator() { return plain('worlds.grove.investigator'); }, icon: '<path d="M5 4c-2 8 5 16 14 14-6 5-15 1-16-6C2 8 3 5 5 4zm0 0 2-1"/>' },
  art: { cast: '/assets/banana/monkeys.png', idle: '/assets/banana/monkey-idle.png', walk: '/assets/banana/detective-walk.png', props: '/assets/banana/jungle-props.png' },
  palette: { ground: '#82a75e', label: '#40533c', labelBg: '#fff6dd' },
  slots: [{ x: 116, y: 156 }, { x: 364, y: 156 }, { x: 364, y: 268 }, { x: 84, y: 212 }, { x: 404, y: 212 }],
};

const tower: WorldPack = {
  id: 'tower',
  text: { get place() { return plain('worlds.tower.place'); }, get eyebrow() { return plain('worlds.tower.eyebrow'); }, day: "POTION DAY", get one() { return plain('worlds.tower.one'); }, get many() { return plain('worlds.tower.many'); }, castLabel: "APPRENTICE", get hint() { return plain('worlds.tower.hint'); }, get oneWithArticle() { return plain('worlds.tower.oneWithArticle'); }, get investigator() { return plain('worlds.tower.investigator'); }, icon: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>' },
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
  text: { get place() { return plain('worlds.friends.place'); }, get eyebrow() { return plain('worlds.friends.eyebrow'); }, day: "GAME NIGHT", get one() { return plain('worlds.friends.one'); }, get many() { return plain('worlds.friends.many'); }, castLabel: "FRIEND", get hint() { return plain('worlds.friends.hint'); }, get oneWithArticle() { return plain('worlds.friends.oneWithArticle'); }, get investigator() { return plain('worlds.friends.investigator'); }, get threadNote() { return plain('worlds.friends.threadNote'); }, icon: '<path d="M4 10h16M6 10v9M18 10v9M3 10c0-3 4-5 9-5s9 2 9 5"/>' },
  art: { cast: '', idle: '', walk: '', props: '' },
  palette: { ground: '#c98f5a', label: '#4a2f1d', labelBg: '#fff0d6' },
  slots: [],
};

// The detective's walk (art request F1): the supplied 4 x 2 sheet, drawn as delivered. Measured on the art
// (alpha >= 128): head column x 189..191, shoes end at y 470..474 except frame 4 (464), head tops 63..73.
// The still poses have the head 4.5 px left of the foot point and the shoes 2 px above it, so the pivot is
// (195, 475). Frame 4 is drawn 8 px lower and frame 8 2 px lower, which puts their shoes on the floor line.
// Scale: the still poses are 353 px tall and the walk 400..410, so 353/407 of the pose scale.
const factoryWalk: WalkSheet = {
  url: '/assets/factory/characters/detective-walk.png',
  cell: { w: 384, h: 512 },
  columns: 4,
  frames: 8,
  pivot: { x: 195, y: 475 },
  scale: (1 / 6) * (353 / 407),
  frameMs: 100,
  offsets: [0, 0, 0, 8, 0, 0, 0, 2],
};

const factory: WorldPack = {
  id: 'factory',
  text: { get place() { return plain('worlds.factory.place'); }, get eyebrow() { return plain('worlds.factory.eyebrow'); }, day: "LAST SHIFT", get one() { return plain('worlds.factory.one'); }, get many() { return plain('worlds.factory.many'); }, castLabel: "WORKER", get hint() { return plain('worlds.factory.hint'); }, get oneWithArticle() { return plain('worlds.factory.oneWithArticle'); }, get investigator() { return plain('worlds.factory.investigator'); }, icon: '<path d="M3 20V9l6 4V9l6 4V5h3v15zm4-3h2m3 0h2"/>' },
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
    walkSheet: factoryWalk,
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

// The detective's walk (art request D1): the supplied 4 x 2 sheet, drawn as delivered. Measured on the art
// (alpha >= 128): her head column is x 202 in every cell and her shoes end at y 470..476, so the pivot is
// (207, 477), which puts head and feet where the still poses have them (head 4 px left of the foot point,
// shoes 2 px above it). Scale: the still poses are 352 px tall and the walk 413..429 (head width 120 vs
// 146..148), so 352/429 of the pose scale. Known art faults: see art/requests/department.md, D1.
const departmentWalk: WalkSheet = {
  url: '/assets/department/characters/player-walk.png',
  cell: { w: 384, h: 512 },
  columns: 4,
  frames: 8,
  pivot: { x: 207, y: 477 },
  scale: (1 / 6) * (352 / 429),
  frameMs: 100,
};

const department: WorldPack = {
  id: 'department',
  text: { get place() { return plain('worlds.department.place'); }, get eyebrow() { return plain('worlds.department.eyebrow'); }, day: "FRIDAY MORNING", get one() { return plain('worlds.department.one'); }, get many() { return plain('worlds.department.many'); }, castLabel: "COLLEAGUE", get hint() { return plain('worlds.department.hint'); }, get oneWithArticle() { return plain('worlds.department.oneWithArticle'); }, get investigator() { return plain('worlds.department.investigator'); }, icon: '<path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm4.5 10.5L20 20"/>' },
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
    walkSheet: departmentWalk,
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

// The scout's walk (art request R1, the accepted sheet; the v2 candidate was not used, see
// art/requests/renaissance.md). Measured on the art (alpha >= 128): head column x 205..207.5 and shoes at
// y 470..473 in every frame; head tops 24 35 24 12 24 36 24 12, a 24 px bob. The still poses have the head
// 1.5 px left of the foot point and the shoes 1 px above it, so the pivot is (210, 473). The offsets pull
// every head top to within 4 px of 24 (the 2nd and 6th frames up 7 and 8, the 4th and 8th down 8), at the
// cost of the shoes leaving the floor line by up to 8 px (about 1 world unit). Scale: the still poses are
// 180 px tall and the walk's contact frames 448, so 180/448 of the pose scale.
const scoutWalk: WalkSheet = {
  url: '/assets/renaissance/characters/scout-walk.png',
  cell: { w: 384, h: 512 },
  columns: 4,
  frames: 8,
  pivot: { x: 210, y: 473 },
  scale: (1 / 3) * (180 / 448),
  frameMs: 100,
  offsets: [0, -7, 0, 8, 0, -8, 0, 8],
};

const renaissance: WorldPack = {
  id: 'renaissance',
  text: { get place() { return plain('worlds.renaissance.place'); }, get eyebrow() { return plain('worlds.renaissance.eyebrow'); }, day: "JUNE 1489", get one() { return plain('worlds.renaissance.one'); }, get many() { return plain('worlds.renaissance.many'); }, castLabel: "TOWNSPERSON", get hint() { return plain('worlds.renaissance.hint'); }, get oneWithArticle() { return plain('worlds.renaissance.oneWithArticle'); }, get investigator() { return plain('worlds.renaissance.investigator'); }, icon: '<path d="M4 20V10l4-3 4 3 4-3 4 3v10zm5 0v-5h6v5"/>' },
  art: { cast: '', idle: '', walk: '', props: '' },
  palette: { ground: '#2a2018', label: '#3b2a1c', labelBg: '#f6ead2' },
  // Cast order: Ottavio (centre-front, sundial steps), Matteo, Beatrice, Bruno, Agnese (right of the well).
  slots: [{ x: 240, y: 262 }, { x: 130, y: 150 }, { x: 330, y: 150 }, { x: 410, y: 260 }, { x: 115, y: 215 }],
  figures: {
    base: '/assets/renaissance/characters',
    props: '/assets/renaissance/props',
    sprites: { ottavio: 'wizard', matteo: 'inventor', beatrice: 'noble', bruno: 'guard', agnese: 'apothecary' },
    detective: 'scout',
    // Frames are registered on the head column and the feet line (art/renaissance/cut.py), the head at the frame's centre.
    frame: { w: 132, h: 188 },
    anchor: { x: 66, y: 185 },
    scale: 1 / 3,
    density: 3,
    labelLift: 66,
    walkSheet: scoutWalk,
    loops: { idle: 4, talk: { wizard: 1, inventor: 1, noble: 2, guard: 1, apothecary: 2, scout: 1 } },
    stopProps: { briefing: 'scroll', report: 'seal' },
  },
  backdrop: { url: '/assets/renaissance/town-square.png', width: 1536, height: 1024, scale: 1 / 3, x: -16, y: 0, fill: '#2a2018' },
  // Cobbled ground only (feet y 122..326); the well and the bench with crates are blocked.
  walk: {
    bounds: { x: 40, y: 122, w: 420, h: 204 },
    blocks: [{ x: -3, y: 173, w: 54, h: 60 }, { x: 417, y: 187, w: 68, h: 60 }],
  },
  stops: { briefing: { x: 240, y: 300 }, report: { x: 330, y: 290 } },
};

const packs: Record<string, WorldPack> = { grove, tower, friends, factory, department, renaissance };

export function worldFor(id: string | undefined): WorldPack {
  return (id !== undefined && Object.hasOwn(packs, id) ? packs[id] : grove) as WorldPack;
}
