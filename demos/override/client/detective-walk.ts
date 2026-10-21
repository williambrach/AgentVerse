import type Phaser from 'phaser';

export type WalkDirection = 'down' | 'up' | 'left' | 'right';

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

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const texture = scene.textures.get(textureKey);
    directions.forEach((direction, row) => {
      for (let pose = 0; pose < 4; pose++) {
        const name = `${direction}-${pose}`;
        if (!texture.has(name)) {
          texture.add(name, 0, columnEdges[pose], rowEdges[row],
            columnEdges[pose + 1] - columnEdges[pose], rowEdges[row + 1] - rowEdges[row]);
        }
      }
    });
    this.sprite = scene.add.sprite(x, y + 4, textureKey, 'down-0').setScale(.16);
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
    const [anchorX, anchorY] = anchors[row][pose];
    this.sprite.setFrame(`${direction}-${pose}`);
    this.sprite.setOrigin(anchorX / this.sprite.frame.width, anchorY / this.sprite.frame.height);
    this.sprite.setPosition(x, y + 4).setDepth(y);
  }
}
