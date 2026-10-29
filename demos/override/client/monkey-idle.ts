import type Phaser from 'phaser';

export type Frame = { x: number; y: number; w: number; h: number; anchorX: number; anchorY: number };
export type IdleSpec = { textureKey: string; poses: Frame[]; scale: number; period: number; offset: number };

const textureKey = 'monkey-idle';
const cellSize = 362;
const periods = [4800, 4300, 5600, 5000, 4500];
const offsets = [0, 1200, 2600, 1800, 3400];
const characters = {
  momo: { row: 0, height: 47, sourceHeight: 317, period: 4800, offset: 0,
    anchors: [[169, 354], [169.5, 354], [169.5, 354], [171, 354]] },
  pip: { row: 1, height: 44, sourceHeight: 313, period: 4300, offset: 1200,
    anchors: [[169.5, 332], [169, 332], [169, 332], [170, 332]] },
  nori: { row: 2, height: 44, sourceHeight: 310, period: 5600, offset: 2600,
    anchors: [[169.5, 313], [169.5, 314], [169.5, 314], [171, 314]] },
};

/** The same poses on another texture (a recoloured copy), with the timing of its own cast slot. */
export function reskinIdle(spec: IdleSpec, textureKey: string, slot: number): IdleSpec {
  return { ...spec, textureKey, period: periods[slot] ?? spec.period, offset: offsets[slot] ?? spec.offset };
}

/** Idle spec for a cast slot: scale fits the tallest pose to `height`. */
export function idleSpec(poses: Frame[], textureKey: string, height: number, slot: number): IdleSpec {
  return {
    textureKey, poses,
    scale: height / Math.max(...poses.map((pose) => pose.h)),
    period: periods[slot], offset: offsets[slot],
  };
}

function groveSpec(config: typeof characters.momo): IdleSpec {
  return {
    textureKey,
    poses: config.anchors.map(([anchorX, anchorY], pose) => ({
      x: pose * cellSize, y: config.row * cellSize, w: cellSize, h: cellSize, anchorX, anchorY,
    })),
    scale: config.height / config.sourceHeight,
    period: config.period, offset: config.offset,
  };
}

export const groveIdle: Record<string, IdleSpec> = {
  momo: groveSpec(characters.momo),
  pip: groveSpec(characters.pip),
  nori: groveSpec(characters.nori),
};

export function loadMonkeyIdle(scene: Phaser.Scene) {
  scene.load.image(textureKey, '/assets/banana/monkey-idle.png');
}

/** Staggered blinks and small gestures, with a greeting on approach. */
export class MonkeyIdle {
  readonly sprite: Phaser.GameObjects.Sprite;
  private elapsed = 0;
  private reactionMs: number | null = null;
  private wasNearby = false;

  readonly x: number;
  readonly y: number;
  private id: string;
  private spec: IdleSpec;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, spec: IdleSpec = groveIdle[id]) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.spec = spec;
    const texture = scene.textures.get(spec.textureKey);
    spec.poses.forEach((frame, pose) => {
      const name = `${id}-${pose}`;
      if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.w, frame.h);
    });
    this.sprite = scene.add.sprite(x, y, spec.textureKey, `${id}-0`)
      .setScale(spec.scale).setDepth(y);
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.reactionMs = null;
    this.wasNearby = false;
    this.showPose(0);
  }

  update(deltaMs: number, enabled: boolean, reducedMotion: boolean, nearby: boolean) {
    if (!enabled || reducedMotion) {
      this.reactionMs = null;
      this.wasNearby = nearby;
      this.showPose(0);
      return;
    }
    this.elapsed += deltaMs;
    if (nearby && !this.wasNearby) this.reactionMs = 0;
    this.wasNearby = nearby;

    if (this.reactionMs !== null) {
      this.reactionMs += deltaMs;
      if (this.reactionMs < 700) {
        this.showPose(this.reactionMs < 180 || this.reactionMs > 520 ? 2 : 3);
        return;
      }
      this.reactionMs = null;
    }

    const { period, offset } = this.spec;
    const phase = (this.elapsed + offset) % period;
    let pose = 0;
    if (phase >= 1000 && phase < 1150) pose = 1;
    else if (phase >= 2300 && phase < 3050) pose = phase < 2500 || phase >= 2900 ? 2 : 3;
    this.showPose(pose);
  }

  private showPose(pose: number) {
    const { anchorX, anchorY, w, h } = this.spec.poses[pose];
    this.sprite.setFrame(`${this.id}-${pose}`).setOrigin(anchorX / w, anchorY / h);
  }
}
