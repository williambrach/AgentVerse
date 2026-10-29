import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });

test('grove canvas matches the start commit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      set(phaser) {
        Object.defineProperty(window, 'Phaser', { value: phaser, configurable: true });
        const Game = phaser.Game;
        phaser.Game = class extends Game {
          constructor(config) { super(config); window.walkingTestGame = this; }
        };
      },
    });
  });
  await page.goto('/?case=banana-mystery');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.waitForFunction(() => window.walkingTestGame?.scene.getScene('banana-grove')?.avatar);
  await page.evaluate(() => new Promise(done => { let n = 0; const tick = () => (++n >= 10 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }));
  await expect(page.locator('#station canvas')).toHaveScreenshot('grove.png', { maxDiffPixels: 50 });
});
