import { test, expect } from '@playwright/test';

// A first-time player: no stored state, so the sponsor intro plays (the config marks it seen everywhere else).
test.use({ storageState: { cookies: [], origins: [] } });

test('first_open_plays_each_logo_then_the_title_then_the_check_in', async ({ page }) => {
  await page.goto('/');
  const splash = page.locator('#splash');
  await expect(splash).toBeVisible();
  for (const [at, id] of ['dfm', 'sdu', 'ucloud'].entries()) {
    await expect(splash).toHaveAttribute('data-sponsor', id, { timeout: 4000 });
    await expect(page.locator(`.splash-logo[data-sponsor="${id}"]`)).toHaveClass(/is-on/);
    await expect(page.locator('.splash-count b')).toHaveText(`0${at + 1}`);
    await expect(page.locator('.splash-pip').nth(at)).toHaveClass(/is-on/);
  }
  const loaded = await page.locator('.splash-logo img').evaluateAll(imgs => imgs.map(img => img.complete && img.naturalWidth > 0));
  expect(loaded).toEqual([true, true, true]);
  await expect(splash).toHaveAttribute('data-step', 'title', { timeout: 4000 });
  await expect(page.locator('.splash-title h1')).toHaveText('Arbiter.');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await expect(page.locator('#team-name')).toBeVisible();
  await expect(splash).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#team-name')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);
});

test('a_key_jumps_to_the_title_and_a_click_starts', async ({ page }) => {
  await page.goto('/');
  const splash = page.locator('#splash');
  await expect(splash).toHaveAttribute('data-sponsor', 'dfm');
  await page.keyboard.press('Space');
  await expect(splash).toHaveAttribute('data-step', 'title', { timeout: 1000 });
  await page.waitForTimeout(400);
  await splash.click();
  await expect(page.locator('#team-name')).toBeVisible();
});

test('a_key_while_the_logos_still_load_skips', async ({ page }) => {
  await page.route('**/sponsors/**', async route => { await new Promise(done => setTimeout(done, 1200)); await route.continue(); });
  // Not 'load': that event waits for the slow logos, and by then the slideshow has started.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const splash = page.locator('#splash');
  await expect(splash).toBeVisible();
  await expect(splash).not.toHaveAttribute('data-sponsor', /./);
  await page.keyboard.press('Space');
  await expect(splash).toHaveAttribute('data-step', 'title', { timeout: 1000 });
  await page.waitForTimeout(1600);
  await expect(splash).toHaveAttribute('data-step', 'title');
  await expect(page.locator('.splash-logo.is-on')).toHaveCount(0);
});

test('tab_reaches_the_skip_button_without_skipping', async ({ page }) => {
  await page.goto('/');
  const splash = page.locator('#splash');
  await expect(splash).toHaveAttribute('data-sponsor', 'dfm');
  await page.keyboard.press('Tab');
  await expect(page.locator('#splash-skip')).toBeFocused();
  await expect(splash).toHaveAttribute('data-step', 'logos');
  await page.keyboard.press('Enter');
  await expect(splash).toHaveAttribute('data-step', 'title', { timeout: 1000 });
});

test('splash_param_replays_it_and_the_big_screen_never_shows_it', async ({ page }) => {
  await page.goto('/?view=board');
  await expect(page.locator('.board-screen')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('override.splash', 'seen'));
  await page.goto('/');
  await expect(page.locator('#team-name')).toBeVisible();
  await page.goto('/?splash=1');
  await expect(page.locator('#splash')).toBeVisible();
});

test('phone_width_has_no_sideways_scroll', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, viewport: { width: 375, height: 740 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveAttribute('data-sponsor', 'dfm');
  for (const step of ['logos', 'title']) {
    if (step === 'title') await page.keyboard.press('Enter');
    await expect(page.locator('#splash')).toHaveAttribute('data-step', step);
    // The splash clips its own overflow, so scrollWidth alone would miss a card or title running off the screen.
    const box = await page.locator('.splash-card, .splash-title h1, .splash-press').evaluateAll(els => els.map(el => el.getBoundingClientRect()));
    expect(Math.max(...box.map(r => r.right))).toBeLessThanOrEqual(375);
    expect(Math.min(...box.map(r => r.left))).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
  await context.close();
});
