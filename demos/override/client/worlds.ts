export interface WorldPack {
  id: string;
  text: { place: string; eyebrow: string; day: string; one: string; many: string; castLabel: string; clueSpot: string; clueNav: string; clueLabel: string; clueTitle: string; hint: string; clickOne: string; investigator: string; icon: string };
  art: { cast: string; idle: string; walk: string; props: string };
  palette: { ground: string; label: string; labelBg: string };
  /** Measured art only: on-screen height of the sheet's tallest cast frame and of the investigator, in px. */
  heights?: { cast: number; investigator: number };
  /** Walk rows (0 down, 1 up, 2 left, 3 right) whose step 3 is rebuilt from step 1 with the legs mirrored. */
  strideFix?: { rows: number[]; band: number; halfWidth: number };
}

const grove: WorldPack = {
  id: 'grove',
  text: { place: 'Banana Grove', eyebrow: 'GROVE', day: 'PICNIC DAY', one: 'monkey', many: 'monkeys', castLabel: 'MONKEY', clueSpot: 'basket', clueNav: 'Basket', clueLabel: 'BANANA BASKET', clueTitle: 'Inspect the banana basket', hint: 'Click a monkey or use WASD / arrows to explore.', clickOne: 'a monkey', investigator: 'monkey investigator', icon: '<path d="M5 4c-2 8 5 16 14 14-6 5-15 1-16-6C2 8 3 5 5 4zm0 0 2-1"/>' },
  art: { cast: '/assets/banana/monkeys.png', idle: '/assets/banana/monkey-idle.png', walk: '/assets/banana/detective-walk.png', props: '/assets/banana/jungle-props.png' },
  palette: { ground: '#82a75e', label: '#40533c', labelBg: '#fff6dd' },
};

const tower: WorldPack = {
  id: 'tower',
  text: { place: 'Wizard Tower', eyebrow: 'TOWER', day: 'POTION DAY', one: 'apprentice', many: 'apprentices', castLabel: 'APPRENTICE', clueSpot: 'potion cabinet', clueNav: 'Cabinet', clueLabel: 'POTION CABINET', clueTitle: 'Inspect the potion cabinet', hint: 'Click an apprentice or use WASD / arrows to explore.', clickOne: 'an apprentice', investigator: 'inspector', icon: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>' },
  art: { cast: '/assets/tower/apprentices.png', idle: '/assets/tower/apprentice-idle.png', walk: '/assets/tower/inspector-walk.png', props: '/assets/tower/tower-props.png' },
  palette: { ground: '#5d566e', label: '#3d3550', labelBg: '#f3ecff' },
  // Juniper (tallest, with her hat) at 47 px; the others keep the sheet's proportions. The inspector is
  // 0.96 of Juniper's height on apprentices.png, the sheet that draws all four at one scale.
  heights: { cast: 47, investigator: 45 },
};

const packs: Record<string, WorldPack> = { grove, tower };

export function worldFor(id: string | undefined): WorldPack {
  return (id !== undefined && Object.hasOwn(packs, id) ? packs[id] : grove) as WorldPack;
}
