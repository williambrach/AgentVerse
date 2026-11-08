import type { WorldPack } from './worlds.ts';
import type { Character, Pose } from './types.ts';

export type StageName = 'station' | 'roundtable';

export interface StageScene {
  configure(world: WorldPack, cast: Character[]): void;
  say(id: string, text: string): void;
  clearBubbles(): void;
  resetPosition(): void;
  setEnabled(on: boolean): void;
  setCovered(covered: boolean): void;
  think?(id: string | null): void;
  speak?(id: string, text: string): void;
  detective?(pose: Pose): void;
  escape?(id: string): Promise<void>;
}

export interface TableScene extends StageScene {
  focus(id: string | null): void;
  think(id: string | null): void;
  speak(id: string, text: string): void;
}

export interface Stage extends TableScene {
  readonly active: StageName | null;
  detective(pose: Pose): void;
  escape(id: string): Promise<void>;
}

export interface StageDeps {
  station: () => StageScene;
  roundtable: () => TableScene;
  show: (which: StageName) => void;
}

/** One stage over two lazily made scenes; the world pack's `scene` picks which one is live. */
export function createStage(deps: StageDeps): Stage {
  let station: StageScene | undefined;
  let table: TableScene | undefined;
  let active: StageName | null = null;
  let enabled = false;
  let covered = false;

  const scene = (which: StageName): StageScene => {
    if (which === 'roundtable') return (table ??= deps.roundtable());
    return (station ??= deps.station());
  };
  const live = (): StageScene | undefined => (active ? scene(active) : undefined);
  const liveTable = (): TableScene | undefined => (active === 'roundtable' ? table : undefined);

  return {
    get active() { return active; },
    configure(world, cast) {
      const next: StageName = world.scene === 'roundtable' ? 'roundtable' : 'station';
      if (next !== active) {
        const old = live();
        if (old) { old.setEnabled(false); old.setCovered(true); old.clearBubbles(); }
        active = next;
        deps.show(next);
        const s = scene(next);
        s.configure(world, cast);
        s.setEnabled(enabled);
        s.setCovered(covered);
        return;
      }
      scene(next).configure(world, cast);
    },
    say(id, text) { live()?.say(id, text); },
    clearBubbles() { live()?.clearBubbles(); },
    resetPosition() { live()?.resetPosition(); },
    setEnabled(on) { enabled = on; live()?.setEnabled(on); },
    setCovered(c) { covered = c; live()?.setCovered(c); },
    focus(id) { liveTable()?.focus(id); },
    think(id) { live()?.think?.(id); },
    speak(id, text) { live()?.speak?.(id, text); },
    detective(pose) { live()?.detective?.(pose); },
    escape(id) { return live()?.escape?.(id) ?? Promise.resolve(); },
  };
}
