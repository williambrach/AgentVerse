import { test, expect } from './team.mjs';

test.skip(process.platform !== 'darwin', 'baseline is darwin only');
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
  // The briefing box covers the world while it is open: close it so the baseline shows the whole grove.
  await page.locator('#dialogue-close').click();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'closed');
  // The HUD floats over the canvas and carries the team name and the shuffled cast: hide it so the baseline is the world alone.
  await page.addStyleTag({ content: '.topbar, .hud-rail, .mode-strip-body { visibility: hidden !important; }' });
  await expect(page.locator('#station canvas')).toHaveScreenshot('grove.png', { maxDiffPixels: 50 });
});
