import type Phaser from 'phaser';

export type WalkDirection = 'down' | 'up' | 'left' | 'right';
export type Frame = { x: number; y: number; w: number; h: number; anchorX: number; anchorY: number };
export type WalkSpec = { textureKey: string; frames: Frame[]; scale: number };

const textureKey = 'detective-walk';
const directions: WalkDirection[] = ['down', 'up', 'left', 'right'];
const rowEdges = [0, 330, 622, 913, 1254];
const columnEdges = [0, 314, 627, 940, 1254];
// Anchor each frame at the hat's center and the planted foot. The generated
// atlas has uneven gutters; these origins prevent the character from sliding.
const anchors = [
  [[171.5, 316], [167.5, 317], [145, 316], [142, 318]],
  [[168, 281], [163, 284], [148, 281], [148.5, 283]],
  [[158, 283], [160, 283], [148.5, 283], [139, 283]],
  [[176.5, 278], [178, 280], [166.5, 278], [155, 279]],
];

/** Walk spec: 16 frames (down, up, left, right x step); scale fits the tallest frame to `height`. */
export function walkSpec(frames: Frame[], textureKey: string, height: number): WalkSpec {
  return { textureKey, frames, scale: height / Math.max(...frames.map((frame) => frame.h)) };
}

export const groveWalk: WalkSpec = {
  textureKey,
  frames: directions.flatMap((_, row) => [0, 1, 2, 3].map((pose) => ({
    x: columnEdges[pose], y: rowEdges[row],
    w: columnEdges[pose + 1] - columnEdges[pose], h: rowEdges[row + 1] - rowEdges[row],
    anchorX: anchors[row][pose][0], anchorY: anchors[row][pose][1],
  }))),
  scale: .16,
};

const pixelsPerPose = 10;

export function loadDetectiveWalk(scene: Phaser.Scene) {
  scene.load.image(textureKey, '/assets/banana/detective-walk.png');
}

/** A four-pose walk cycle driven by actual travel, independent of input method. */
export class DetectiveWalk {
  readonly sprite: Phaser.GameObjects.Sprite;
  private distance = 0;
  private stationaryMs = 0;
  private lastX: number;
  private lastY: number;

  private spec: WalkSpec;

  constructor(scene: Phaser.Scene, x: number, y: number, spec: WalkSpec = groveWalk) {
    this.spec = spec;
    const texture = scene.textures.get(spec.textureKey);
    directions.forEach((direction, row) => {
      for (let pose = 0; pose < 4; pose++) {
        const name = `${direction}-${pose}`;
        const frame = spec.frames[row * 4 + pose];
        if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.w, frame.h);
      }
    });
    this.sprite = scene.add.sprite(x, y + 4, spec.textureKey, 'down-0').setScale(spec.scale);
    this.lastX = x;
    this.lastY = y;
    this.reset(x, y);
  }

  reset(x: number, y: number, direction: WalkDirection = 'down') {
    this.lastX = x;
    this.lastY = y;
    this.distance = 0;
    this.stationaryMs = 0;
    this.showPose(x, y, direction, 0);
  }

  update(x: number, y: number, direction: WalkDirection, moving: boolean, reducedMotion: boolean, deltaMs: number) {
    const traveled = Math.hypot(x - this.lastX, y - this.lastY);
    this.lastX = x;
    this.lastY = y;
    if (!moving || reducedMotion || traveled > 24) {
      this.distance = 0;
      this.stationaryMs = 0;
    } else if (traveled >= .01) {
      this.distance = (this.distance + traveled) % (pixelsPerPose * 4);
      this.stationaryMs = 0;
    } else {
      // Rendering may run faster than physics (e.g. 120 Hz versus 60 Hz).
      // Keep the stride between physics ticks; only sustained lack of motion
      // means we are blocked. Releasing movement still goes idle immediately.
      this.stationaryMs += deltaMs;
      if (this.stationaryMs >= 80) this.distance = 0;
    }
    this.showPose(x, y, direction, Math.floor(this.distance / pixelsPerPose));
  }

  private showPose(x: number, y: number, direction: WalkDirection, pose: number) {
    const row = directions.indexOf(direction);
    const { anchorX, anchorY, w, h } = this.spec.frames[row * 4 + pose];
    this.sprite.setFrame(`${direction}-${pose}`);
    this.sprite.setOrigin(anchorX / w, anchorY / h);
    this.sprite.setPosition(x, y + 4).setDepth(y);
  }
}
