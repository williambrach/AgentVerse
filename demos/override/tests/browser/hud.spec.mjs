import { test as base } from '@playwright/test';
import { test, expect, joinTeam } from './team.mjs';
import { interviewAll, lockIn } from './cast.mjs';

const SIZES = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]];

async function begin(page, url = '/') {
  await page.goto(url);
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'open');
}

const castButtons = page => page.locator('#room-nav [data-go]');
const rect = (page, selector) => page.locator(selector).first().evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
// Lets the page render `n` frames: an observation window that is not a sleep.
const frames = (page, n) => page.evaluate(n => new Promise(done => { const tick = () => (--n <= 0 ? done() : requestAnimationFrame(tick)); tick(); }), n);
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

for (const [w, h] of SIZES) {
  test(`stage_fills_window_${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await begin(page);
    await page.locator('#dialogue-close').click();
    await expect(page.locator('.dossier')).toBeHidden();
    const canvas = await rect(page, '#station canvas');
    expect(Math.abs(canvas.width - w)).toBeLessThanOrEqual(2);
    expect(Math.abs(canvas.height - h)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight)).toBe(true);
    const rail = await rect(page, '.hud-rail'), bar = await rect(page, '.topbar');
    const labels = await page.locator('.station-label').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) { expect(overlaps(label, rail)).toBe(false); expect(overlaps(label, bar)).toBe(false); }
    // The top bar keeps the mode visible at every desktop width.
    await expect(page.locator('.authored-label')).toBeVisible();
    await expect(page.locator('#mode-badge')).toBeVisible();
    expect(bar.height).toBeLessThan(80);
  });
}

test('resize_keeps_labels_on_world', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  // The label layer is the world rect: 480 x 340 game pixels, offset inside the canvas.
  await expect.poll(async () => {
    const layer = await rect(page, '.station-labels'), canvas = await rect(page, '#station canvas');
    const scale = layer.width / 480;
    return [Math.abs(layer.height - 340 * scale) < 2, layer.left >= canvas.left - 1, layer.right <= canvas.right + 1, Math.abs(canvas.width - 1280) <= 2];
  }).toEqual([true, true, true, true]);
  const layer = await rect(page, '.station-labels'), canvas = await rect(page, '#station canvas');
  expect(layer.width).toBeLessThan(canvas.width);
  expect(layer.left).toBeGreaterThan(canvas.left + 1);
});

test('walking_closes_the_box_and_a_card_opens_it', async ({ page }) => {
  await begin(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await expect(page.locator('.dossier')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'closed');
  await castButtons(page).first().click();
  await expect(page.locator('.dossier')).toBeVisible();
  await expect(page.locator('.dialogue')).toBeVisible();
});

test('interview_follow_up_keeps_the_transcript_on_the_newest_turn', async ({ page }) => {
  await begin(page);
  await castButtons(page).first().click();
  await page.locator('[data-quick-question]').click();
  const speech = page.locator('#transcript .speech.character');
  await expect(speech).toHaveCount(2);
  const first = await speech.nth(1).innerText();
  await expect(page.locator('#interview-form .ask-button')).toBeEnabled();
  await page.locator('#question').fill('Did anyone see you leave?');
  await page.locator('#question').press('Enter');
  await expect(speech).toHaveCount(3);
  expect(await page.locator('#transcript').innerText()).toContain(first.split('\n').pop().trim());
  await expect.poll(() => page.locator('#transcript').evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
});

test('wasd_while_typing', async ({ page }) => {
  await begin(page);
  await castButtons(page).first().click();
  await page.locator('#question').click();
  await page.keyboard.type('wasd w a s d');
  await page.waitForTimeout(250);
  await expect(page.locator('#question')).toHaveValue('wasd w a s d');
  await expect(page.locator('.dossier')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'open');
});

test('escape_with_overlay', async ({ page }) => {
  await begin(page);
  await castButtons(page).first().click();
  await page.locator('#reset-button').click();
  await expect(page.locator('#case-switch')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#case-switch')).toHaveCount(0);
  await expect(page.locator('.dossier')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dossier')).toBeHidden();
});

test('verdict_lineup_and_debrief', async ({ page }) => {
  await begin(page);
  const n = (await interviewAll(page)).length;
  await page.locator('.hud-rail [data-go="report"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await expect(page.locator('fieldset.role-row')).toHaveCount(n);
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('#lock-in')).toBeDisabled();
  const first = page.locator('fieldset.role-row').first();
  await first.locator('input[value="honest"]').focus();
  await page.keyboard.press('ArrowRight');
  const picked = await first.locator('input:checked').getAttribute('value');
  expect(picked).not.toBe('honest');
  const names = await page.locator('fieldset.role-row').evaluateAll(rows => rows.map(r => r.querySelector('input').name));
  for (const name of names) await page.locator(`input[name="${name}"][value="villain"]`).check({ force: true });
  await expect(page.locator('#lock-in')).toBeEnabled();
  await page.locator('#lock-in').click();
  await expect(page.locator('.finding').first()).toBeVisible();
  await expect(page.locator('.finding')).toHaveCount(n);
  // The debrief is a full page like the lineup.
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await expect(page.locator('#quick-progress')).toHaveText('Case closed');
  const events = (await (await page.request.get('/api/events')).text()).split('\n').filter(Boolean).map(line => JSON.parse(line));
  expect(events.filter(e => e.type === 'verdict_submitted').at(-1).verdict.confidence).toBe(70);
});

test('lineup_back_returns_to_the_map', async ({ page }) => {
  await begin(page);
  await interviewAll(page);
  await page.locator('.hud-rail [data-go="report"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await page.locator('#lineup-back').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'world');
  await expect(page.locator('.topbar')).toBeVisible();
});

test('tower_lineup_fits_and_theme', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await begin(page, '/?case=tower-echo-bell');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'tower');
  // The tower stage has no bare ground band: the overscan is filled with bookcases, so the canvas still fills the window.
  const canvas = await rect(page, '#station canvas');
  expect(Math.abs(canvas.width - 1280)).toBeLessThanOrEqual(2);
  await interviewAll(page);
  await page.locator('.hud-rail [data-go="report"]').click();
  await expect(page.locator('fieldset.role-row')).toHaveCount(3);
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.lineup-board').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

// Findings from the first review round.

test('new_team_checks_in_and_the_case_board_takes_real_clicks', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#team-name').fill(`Gate ${Date.now().toString(36)}`);
  await page.locator('#team-submit').click();
  await expect(page.locator('#begin-button')).toBeVisible();
  const radios = page.locator('#case-list input[type="radio"]');
  expect(await radios.count()).toBeGreaterThan(1);
  await radios.nth(1).click();
  await expect(radios.nth(1)).toBeChecked();
  await radios.nth(0).click();
  await expect(radios.nth(0)).toBeChecked();
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await context.close();
});

test('phone_has_no_sideways_scroll_and_a_two_row_top_bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  expect(await page.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth])).toEqual([390, 390]);
  const canvas = await rect(page, '#station canvas'), bar = await rect(page, '.topbar');
  expect(canvas.top).toBeLessThan(200);
  const rows = await page.locator('.topbar > :visible').evaluateAll(els => new Set(els.map(el => Math.round(el.getBoundingClientRect().top))).size);
  expect(rows).toBeLessThanOrEqual(2);
  expect(bar.height).toBeLessThan(130);
  await expect(page.locator('.topbar .world-panel')).toBeHidden();
  await expect(page.locator('#mode-badge')).toBeVisible();
});

for (const [w, h] of [[1280, 720], [1440, 900]]) {
  test(`toolbelt_labels_fit_${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await begin(page);
    expect(await page.locator('#continue-button').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('#continue-button')).toHaveText('Let them talk');
    expect(await page.locator('#inspect-button').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    // The off card is opaque and readable: no disabled fade, and a solid background.
    const off = await page.locator('.tool-card.off').first().evaluate(el => {
      const card = getComputedStyle(el), button = getComputedStyle(el.querySelector('.tool-button'));
      return { bg: card.backgroundColor, opacity: button.opacity, color: button.color };
    });
    expect(off.opacity).toBe('1');
    expect(off.bg).toMatch(/^rgb\(/);
    const group = await page.locator('#toolbelt').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(group).toMatch(/^rgb\(/);
    const label = await rect(page, '.toolbelt-label');
    const tag = page.locator('.tool-new');
    if (await tag.count()) expect(overlaps(await rect(page, '.tool-new'), label)).toBe(false);
  });
}

test('top_bar_keeps_case_and_team_whole_and_the_strip_sits_below', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const name = `Night Owls ${Date.now().toString(36).slice(-3)}`;
  expect((await context.request.post('/api/team', { data: { name } })).status()).toBe(200);
  const page = await context.newPage();
  await begin(page);
  expect(await page.locator('.team-name').evaluate(el => [el.textContent, el.scrollWidth <= el.clientWidth])).toEqual([name, true]);
  expect(await page.locator('#case-headline').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const bar = await rect(page, '.topbar'), strip = await rect(page, '.mode-strip-body'), box = await rect(page, '.dossier');
  expect(strip.top).toBeGreaterThanOrEqual(bar.bottom);
  expect(Math.abs(strip.right - bar.right)).toBeLessThanOrEqual(2);
  expect(overlaps(strip, box)).toBe(false);
  expect(await page.locator('.topbar').evaluate(el => el.contains(document.querySelector('.authored-label')) || el.contains(document.querySelector('#mode-badge')))).toBe(false);
  await page.setViewportSize({ width: 1280, height: 720 });
  expect((await rect(page, '.topbar')).height).toBeLessThan(80);
  await expect(page.locator('.authored-label')).toBeVisible();
  await context.close();
});

test('progress_line_and_timer_use_the_design_copy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await expect(page.locator('#quick-progress')).toHaveText('0 of 4 asked \u00b7 free');
  expect(await page.locator('#quick-progress').evaluate(el => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 20)).toBe(true);
  await expect.poll(async () => (await page.locator('#elapsed, [data-elapsed]').allInnerTexts()).every(text => /^\d+:\d\d$/.test(text))).toBe(true);
});

test('speech_bubble_stays_below_the_top_bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const long = 'I keep going over it in my head. '.repeat(14);
  await page.route('**/api/continue', async route => {
    const res = await route.fetch();
    const data = await res.json();
    const line = data.session.thread.at(-1);
    if (line) { line.text = long; line.character = data.characters[0].id; }
    await route.fulfill({ response: res, json: data });
  });
  await begin(page);
  await interviewAll(page);
  await page.locator('#continue-button').click();
  const bubble = page.locator('.station-bubble');
  await expect(bubble).toBeVisible();
  const bar = await rect(page, '.topbar');
  expect((await rect(page, '.station-bubble')).top).toBeGreaterThanOrEqual(bar.bottom);
});

test('lock_in_button_keeps_its_label_and_count_while_picking', async ({ page }) => {
  await begin(page);
  await interviewAll(page);
  await page.locator('.hud-rail [data-go="report"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  const names = await page.locator('fieldset.role-row').evaluateAll(rows => rows.map(r => r.querySelector('input').name));
  expect(names.length).toBe(4);
  for (const name of names.slice(0, 2)) await page.locator(`input[name="${name}"][value="villain"]`).check({ force: true });
  const lock = page.locator('#lock-in');
  await expect(lock).toBeDisabled();
  await expect(lock).toContainText('Lock in verdict');
  await expect(lock).toContainText('2 of 4 picked');
  await expect(lock).not.toContainText('Pick a role');
  for (const name of names.slice(2)) await page.locator(`input[name="${name}"][value="villain"]`).check({ force: true });
  await expect(lock).toBeEnabled();
  await expect(lock).toContainText('Lock in verdict');
});

// Integration: the whole app wired together.

const fullWindow = async page => {
  const box = await rect(page, '.dossier');
  const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
  return [box.left, box.top, box.width, box.height].map(Math.round).join() === [0, 0, w, h].join();
};

test('lineup_covers_the_viewport_edge_to_edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await interviewAll(page);
  await page.locator('.hud-rail [data-go="report"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await expect.poll(() => fullWindow(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => fullWindow(page)).toBe(true);
});

test('progress_reads_4_of_4_asked_when_everyone_is_asked', async ({ page }) => {
  await begin(page);
  await interviewAll(page);
  await expect(page.locator('#quick-progress')).toHaveText('4 of 4 asked \u00b7 free');
  await expect(page.locator('#quick-progress')).not.toContainText('Ready to make your guess');
});

test('debrief_is_a_full_page_with_a_finding_per_character', async ({ page }) => {
  await begin(page);
  const ids = await interviewAll(page);
  await lockIn(page, Object.fromEntries(ids.map(id => [id, 'honest'])));
  await expect(page.locator('.finding')).toHaveCount(ids.length);
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await expect.poll(() => fullWindow(page)).toBe(true);
  await expect(page.locator('#debrief-leaderboard')).toBeVisible();
});

test('five_characters_fit_the_lineup_and_the_rail_at_1280x720', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await begin(page);
  // The rail: a fifth card is added to the DOM; it must stay on screen or the rail must scroll.
  await page.locator('#room-nav [data-go]').last().evaluate(el => el.parentElement.appendChild(el.cloneNode(true)));
  expect(await castButtons(page).count()).toBe(5);
  const rail = await page.locator('.hud-rail').evaluate(el => ({ scrolls: el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY), bottom: el.getBoundingClientRect().bottom, inner: innerHeight }));
  const last = await castButtons(page).last().evaluate(el => el.getBoundingClientRect().bottom);
  expect(rail.scrolls || last <= rail.inner).toBe(true);
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)).toBe(true);
});

test('lineup_with_five_rows_has_no_horizontal_overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await begin(page);
  await interviewAll(page);
  await page.locator('.hud-rail [data-go="report"]').click();
  await expect(page.locator('fieldset.role-row')).toHaveCount(4);
  await page.locator('.lineup-cards').evaluate(el => { const card = el.querySelector('fieldset.role-row'); el.appendChild(card.cloneNode(true)); el.style.setProperty('--n', '5'); });
  await expect(page.locator('fieldset.role-row')).toHaveCount(5);
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.lineup-board').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.locator('.lineup-cards').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

/** One team plays a case through in its own context: quick question each, all honest, lock in. */
async function finishCase(browser, baseURL, name) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  await joinTeam(context, name);
  const page = await context.newPage();
  await begin(page);
  const ids = await interviewAll(page);
  await lockIn(page, Object.fromEntries(ids.map(id => [id, 'honest'])));
  await expect(page.locator('.finding').first()).toBeVisible();
  await context.close();
}

test('board_without_phaser', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const chunks = [];
  page.on('request', request => { if (/assets\/station-.*\.js/.test(request.url())) chunks.push(request.url()); });
  await page.goto('/?view=board');
  await expect(page.locator('.board-screen')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(chunks).toEqual([]);
  await context.close();
});

test('board_no_presence', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const beats = [];
  page.on('request', request => { if (request.url().includes('/api/heartbeat')) beats.push(request.url()); });
  await page.goto('/?view=board');
  await expect(page.locator('.board-screen')).toBeVisible();
  await expect(page.locator('#team-form')).toHaveCount(0);
  await expect(page).toHaveTitle(/Leaderboard/);
  const tag = Date.now().toString(36).slice(-4);
  // The screen lists only the top rows, so count TEAMS instead of looking for rows.
  const teams = page.locator('.board-counts > div', { hasText: 'TEAMS' }).locator('b');
  await expect(teams).toHaveText(/^\d+$/);
  const before = Number(await teams.textContent());
  await finishCase(browser, baseURL, `Alpha ${tag}`);
  await finishCase(browser, baseURL, `Bravo ${tag}`);
  // No reload: the screen polls.
  await expect(teams).toHaveText(String(before + 2), { timeout: 25_000 });
  await expect(page.locator('#team-form')).toHaveCount(0);
  expect(beats).toEqual([]);
  await context.close();
});

// Findings from the second review round.

const channel = v => { const n = v / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
const luminance = css => { const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const inside = (inner, outer) => inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;

test('dialogue_close_sits_inside_the_box_on_every_panel_and_closes_it', async ({ page }) => {
  await begin(page);
  const check = async () => {
    await expect(page.locator('.dossier')).toBeVisible();
    const box = await rect(page, '.dossier'), close = await rect(page, '#dialogue-close');
    expect(inside(close, box), JSON.stringify({ box, close })).toBe(true);
    // Top right quarter of the box, not left of the speaker tag.
    expect(close.left).toBeGreaterThan(box.left + box.width * 0.75);
    expect(close.top - box.top).toBeLessThan(80);
  };
  const closeIt = async () => { await page.locator('#dialogue-close').click(); await expect(page.locator('.dossier')).toBeHidden(); };
  await check(); // briefing
  await closeIt();
  await castButtons(page).first().click();
  await expect(page.locator('.dialogue')).toBeVisible();
  await check(); // interview
  const dialogue = await rect(page, '.dialogue'), close = await rect(page, '#dialogue-close');
  expect(inside(close, dialogue)).toBe(true);
  await page.locator('#read-thread').click();
  await expect(page.locator('.thread-panel')).toBeVisible();
  await check(); // thread
  await closeIt();
});

test('no_frame_around_the_gate_and_the_hud_pads_only_when_it_is_up', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const gate = await context.newPage();
  await gate.goto('/');
  await expect(gate.locator('#team-form')).toBeVisible();
  expect(await gate.locator('#app').evaluate(el => getComputedStyle(el).padding)).toBe('0px');
  const screen = await rect(gate, '.access-screen');
  expect(screen.left).toBe(0); expect(screen.top).toBe(0);
  await joinTeam(context, `Frame ${Date.now().toString(36)}`);
  await gate.goto('/?view=board');
  await expect(gate.locator('.board-screen')).toBeVisible();
  expect(await gate.locator('#app').evaluate(el => getComputedStyle(el).padding)).toBe('0px');
  await gate.goto('/');
  await gate.locator('#begin-button').click();
  await expect(gate.locator('#app')).toHaveAttribute('data-hud', 'on');
  expect(await gate.locator('#app').evaluate(el => getComputedStyle(el).padding)).toBe('16px');
  await context.close();
});

test('dark_panels_have_a_gold_primary_and_a_cream_outline_secondary', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const gate = await context.newPage();
  await gate.goto('/');
  await expect(gate.locator('#team-form')).toBeVisible();
  const colours = (page, selector) => page.locator(selector).first().evaluate(el => { const s = getComputedStyle(el); return { color: s.color, bg: s.backgroundColor, border: s.borderTopColor }; });
  const card = await gate.locator('.team-gate').evaluate(el => getComputedStyle(el).backgroundColor);
  const primary = await colours(gate, '#team-submit');
  expect(primary.bg).toBe('rgb(244, 183, 64)');
  expect(contrast(primary.color, primary.bg)).toBeGreaterThanOrEqual(4.5);
  const eyebrow = await colours(gate, '.team-gate .eyebrow');
  expect(contrast(eyebrow.color, card)).toBeGreaterThanOrEqual(4.5);
  // The overlay: its Close is a cream outline with readable text, its eyebrow is bright enough.
  await gate.locator('#team-name').fill(`Dark ${Date.now().toString(36)}`);
  await gate.locator('#team-submit').click();
  await gate.locator('#begin-button').click();
  await gate.locator('#leaderboard-button').click();
  await expect(gate.locator('.board-card')).toBeVisible();
  const panel = await gate.locator('.board-card').evaluate(el => getComputedStyle(el).backgroundColor);
  const close = await colours(gate, '#leaderboard-close');
  expect(close.border).toBe('rgb(244, 235, 211)');
  expect(contrast(close.color, panel)).toBeGreaterThanOrEqual(4.5);
  expect(contrast((await colours(gate, '.board-card .eyebrow')).color, panel)).toBeGreaterThanOrEqual(4.5);
  await context.close();
});

test('leaderboard_overlay_table_is_styled_and_a_row_fits_one_line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await page.locator('#leaderboard-button').click();
  await expect(page.locator('.board-card .board-row.you')).toBeVisible();
  await expect(page.locator('.board-card .board-table')).toBeVisible();
  await expect.poll(async () => (await rect(page, '.board-card')).width).toBeGreaterThanOrEqual(800);
  const card = await rect(page, '.board-card');
  const row = await rect(page, '.board-card .board-row');
  expect(row.height).toBeLessThan(60);
  const table = await page.locator('.board-card .board-table').evaluate(el => ({ collapse: getComputedStyle(el).borderCollapse, width: el.getBoundingClientRect().width, caption: getComputedStyle(el.querySelector('caption')).textTransform }));
  expect(table.collapse).toBe('collapse');
  expect(table.width).toBeGreaterThan(card.width * 0.8);
  expect(table.caption).toBe('uppercase');
  expect(await page.locator('.board-card .board-row.you td').first().evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
});

test('big_screen_cells_share_a_baseline_and_never_highlight_the_checked_in_browser', async ({ page }) => {
  await page.goto('/?view=board');
  await expect(page.locator('.board-screen')).toBeVisible();
  await expect.poll(() => page.locator('.board-row').count()).toBeGreaterThan(0);
  expect(await page.locator('.board-row.you').count()).toBe(0);
  // Real CSS on a row that mixes every state: filled and empty cells must line up.
  await page.evaluate(() => {
    const cells = ['perfect', 'none', 'playing', 'zero', 'partial'].map(s => `<span class="cell ${s}"><span aria-hidden="true">${s === 'none' ? '' : '1'}</span></span>`).join('');
    document.querySelector('#app').innerHTML = `<div class="board-screen"><table class="board-table"><tbody><tr class="board-row"><td class="board-cells">${cells}</td></tr></tbody></table></div>`;
  });
  const tops = await page.locator('.board-cells .cell').evaluateAll(els => els.map(el => el.getBoundingClientRect().top));
  expect(new Set(tops.map(t => Math.round(t * 2))).size).toBe(1);
});

test('team_chip_stays_readable_at_390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  // The widest second row: the coin counter on (this server has no budget, so show it as the budgeted rehearsal does).
  await page.evaluate(() => { const c = document.querySelector('#coin-counter'); c.hidden = false; c.innerHTML = '<span class="coin-num">18 / 20</span><span class="hud-label">COINS LEFT</span>'; });
  const chip = await rect(page, '.team-panel'), name = await rect(page, '.team-name');
  expect(chip.width).toBeGreaterThanOrEqual(88);
  expect(name.width).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBe(390);
  const rows = await page.locator('.topbar > :visible').evaluateAll(els => new Set(els.map(el => Math.round(el.getBoundingClientRect().top))).size);
  expect(rows).toBeLessThanOrEqual(2);
});

test('case_board_preview_is_styled_on_parchment_and_the_fourth_face_is_recoloured', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.case-board .intro-card');
  await expect(card).toBeVisible();
  const look = await card.evaluate(el => {
    const css = s => getComputedStyle(el.querySelector(s));
    return { padding: getComputedStyle(el).paddingLeft, h2: css('h2').fontSize, lead: css('.intro-lead').fontSize, bg: getComputedStyle(el).backgroundColor, ink: css('h2').color, fine: css('.fine-print').color, button: css('#begin-button').backgroundColor, flow: css('.intro-flow span').borderTopWidth };
  });
  expect(parseFloat(look.padding)).toBeGreaterThanOrEqual(24);
  expect(parseFloat(look.h2)).toBeGreaterThanOrEqual(30);
  expect(parseFloat(look.lead)).toBeGreaterThanOrEqual(17);
  expect(look.button).toBe('rgb(244, 183, 64)');
  expect(contrast(look.ink, look.bg)).toBeGreaterThanOrEqual(7);
  expect(contrast(look.fine, look.bg)).toBeGreaterThanOrEqual(4.5);
  // After the world has loaded, slot 3 wears the recoloured sheet, not the plain one.
  await expect.poll(() => page.locator('.monkey-line .slot-3').first().evaluate(el => getComputedStyle(el).backgroundImage), { timeout: 15_000 }).toMatch(/blob:/);
  const same = await page.locator('.monkey-line .slot-3').first().evaluate(el => getComputedStyle(el).backgroundImage === getComputedStyle(document.documentElement).getPropertyValue('--face-sheet-grove-3').trim());
  expect(same).toBe(true);
  // The case switcher keeps the same pane, with a readable outlined secondary.
  await page.locator('#begin-button').click();
  await page.locator('#reset-button').click();
  await expect(page.locator('#case-switch .intro-card')).toBeVisible();
  const keep = await page.locator('#cancel-reset').evaluate(el => { const s = getComputedStyle(el); return { color: s.color, bg: getComputedStyle(el.closest('.intro-card')).backgroundColor }; });
  expect(contrast(keep.color, keep.bg)).toBeGreaterThanOrEqual(7);
});

// Review findings: focus, walking after an overlay, a failing board poll.

test('closing_the_dialogue_moves_focus_to_the_notebook_button', async ({ page }) => {
  await begin(page);
  await page.locator('#dialogue-close').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.dossier')).toBeHidden();
  await expect(page.locator('#notebook-button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.dossier')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#notebook-button')).toBeFocused();
});

test('closing_an_overlay_on_the_debrief_keeps_walking_off', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      set(phaser) {
        Object.defineProperty(window, 'Phaser', { value: phaser, configurable: true });
        const Game = phaser.Game;
        phaser.Game = class extends Game { constructor(config) { super(config); window.hudTestGame = this; } };
      },
    });
  });
  await begin(page);
  const ids = await interviewAll(page);
  await lockIn(page, Object.fromEntries(ids.map(id => [id, 'honest'])));
  await expect(page.locator('.finding').first()).toBeVisible();
  await page.locator('#debrief-leaderboard').click();
  await page.locator('#leaderboard-close').click();
  await expect(page.locator('#leaderboard')).toHaveCount(0);
  expect(await page.evaluate(() => window.hudTestGame.scene.getScene('banana-grove').enabled)).toBe(false);
});

test('board_poll_failure_is_announced_and_recovers', async ({ page }) => {
  await page.goto('/?view=board');
  await expect(page.locator('.board-screen')).toBeVisible();
  await page.route('**/api/leaderboard', route => route.abort());
  await expect(page.locator('.board-stale')).toBeVisible({ timeout: 25_000 });
  await page.unroute('**/api/leaderboard');
  await expect(page.locator('.board-stale')).toHaveCount(0, { timeout: 25_000 });
});

test('fonts_load_with_every_outside_host_blocked', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const outside = [], fonts = [];
  await page.route(url => url.protocol.startsWith('http') && url.origin !== origin, route => { outside.push(route.request().url()); return route.abort(); });
  page.on('response', response => { if (response.url().endsWith('.woff2')) fonts.push(response); });
  await begin(page);
  await page.evaluate(() => document.fonts.ready);
  expect(outside).toEqual([]);
  const loaded = await page.evaluate(() => [...document.fonts].filter(f => f.family.includes('Atkinson Hyperlegible Next') && f.status === 'loaded').length);
  expect(loaded).toBeGreaterThan(0);
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts[0].headers()['content-type']).toBe('font/woff2');
  expect(fonts[0].headers()['cache-control']).toContain('immutable');
  expect(await page.locator('.topbar #case-headline').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Atkinson Hyperlegible Next');
});

test('box_does_not_blink_on_updates', async ({ page }) => {
  await begin(page, '/?case=banana-mystery');
  await castButtons(page).first().click();
  await expect(page.locator('[data-quick-question]')).toBeVisible();
  // The page-turn animation belongs to a change of page, and has finished here.
  await expect.poll(() => page.locator('.notebook-page').first().evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.99);
  await page.evaluate(() => {
    window.lowest = 1;
    const tick = () => { window.lowest = Math.min(window.lowest, Number(getComputedStyle(document.querySelector('.notebook-page')).opacity)); requestAnimationFrame(tick); };
    tick();
  });
  await page.locator('[data-quick-question]').click();
  await expect(page.locator('.speech.character.latest')).toBeVisible();
  await frames(page, 30);
  expect(await page.evaluate(() => window.lowest)).toBeGreaterThan(0.99);
});
