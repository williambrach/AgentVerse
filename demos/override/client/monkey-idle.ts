import type Phaser from 'phaser';
import type { CharacterId } from './types';

const textureKey = 'monkey-idle';
const cellSize = 362;
const characters = {
  momo: { row: 0, height: 47, sourceHeight: 317, period: 4800, offset: 0,
    anchors: [[169, 354], [169.5, 354], [169.5, 354], [171, 354]] },
  pip: { row: 1, height: 44, sourceHeight: 313, period: 4300, offset: 1200,
    anchors: [[169.5, 332], [169, 332], [169, 332], [170, 332]] },
  nori: { row: 2, height: 44, sourceHeight: 310, period: 5600, offset: 2600,
    anchors: [[169.5, 313], [169.5, 314], [169.5, 314], [171, 314]] },
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

  constructor(scene: Phaser.Scene, private id: CharacterId, readonly x: number, readonly y: number) {
    const config = characters[id];
    const texture = scene.textures.get(textureKey);
    for (let pose = 0; pose < 4; pose++) {
      const name = `${id}-${pose}`;
      if (!texture.has(name)) texture.add(name, 0, pose * cellSize, config.row * cellSize, cellSize, cellSize);
    }
    this.sprite = scene.add.sprite(x, y, textureKey, `${id}-0`)
      .setScale(config.height / config.sourceHeight).setDepth(y);
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

    const { period, offset } = characters[this.id];
    const phase = (this.elapsed + offset) % period;
    let pose = 0;
    if (phase >= 1000 && phase < 1150) pose = 1;
    else if (phase >= 2300 && phase < 3050) pose = phase < 2500 || phase >= 2900 ? 2 : 3;
    this.showPose(pose);
  }

  private showPose(pose: number) {
    const [anchorX, anchorY] = characters[this.id].anchors[pose];
    this.sprite.setFrame(`${this.id}-${pose}`).setOrigin(anchorX / cellSize, anchorY / cellSize);
  }
}
