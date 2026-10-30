// Captures the real grove scene from a running rehearsal server as the teaser's backdrop:
// cache/plate-native.png is the Phaser canvas at its own 480×340 resolution (one PNG pixel per game pixel).
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4330';
const cache = new URL('./cache/', import.meta.url);
await mkdir(cache, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
// Same hook as tests/browser/grove-look.spec.mjs: keep a handle on the Phaser game.
await page.addInitScript(() => {
  Object.defineProperty(window, 'Phaser', {
    configurable: true,
    set(phaser) {
      Object.defineProperty(window, 'Phaser', { value: phaser, configurable: true });
      const Game = phaser.Game;
      phaser.Game = class extends Game { constructor(config) { super(config); window.teaserGame = this; } };
    },
  });
});
await page.goto(`${base}/?case=banana-mystery`);
await page.locator('#begin-button').click();
await page.locator('#intro').waitFor({ state: 'detached' });
await page.waitForFunction(() => window.teaserGame?.scene.getScene('banana-grove')?.avatar);
await page.waitForTimeout(1000);

const png = await page.evaluate(() => new Promise(done => window.teaserGame.renderer.snapshot(img => {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  done(c.toDataURL('image/png'));
})));
await writeFile(new URL('plate-native.png', cache), Buffer.from(png.split(',')[1], 'base64'));
console.log('wrote cache/plate-native.png');
await browser.close();
