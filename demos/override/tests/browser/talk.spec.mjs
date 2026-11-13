import { readFileSync } from 'node:fs';
import { test, expect } from './team.mjs';

// The friends' thread footnote, from the game text (the chats-private copy).
const FRIENDS_NOTE = JSON.parse(readFileSync(new URL('../../client/text/worlds.json', import.meta.url), 'utf8'))['worlds.friends.threadNote'];

// "Let them talk" at the roundtable: every friend speaks once per round, the thread is readable,
// and the speech bubbles never hide under the top bar or cut a line in half.

async function start(page) {
  await page.goto('/?case=friends-roundtable');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await expect(page.locator('#roundtable')).toBeVisible();
}

/** Every friend whose bubble showed up, polled until `count` were seen. */
async function speakers(page, count) {
  const seen = new Set();
  await expect.poll(async () => {
    const who = await page.locator('.roundtable-bubble').first().getAttribute('data-actor', { timeout: 500 }).catch(() => null);
    if (who) seen.add(who);
    return seen.size;
  }, { timeout: 60_000, intervals: [100] }).toBe(count);
  return seen;
}

const rect = (page, sel) => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; });

test('talk_round_hears_all_five: one press, five friends, the closed notebook opens on the thread', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await page.locator('#dialogue-close').click();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'closed');
  await page.locator('#continue-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'open');
  await expect(page.locator('#thread-log')).toBeVisible();
  const seen = await speakers(page, 5);
  expect([...seen].sort()).toEqual(['alex', 'ken', 'maya', 'nora', 'sam']);
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(5);
  await expect(page.locator('#continue-button')).toContainText('Let them talk');
  // Friends keep their chats private: the thread says so.
  await expect(page.locator('.thread-panel .fine')).toHaveText(FRIENDS_NOTE);
  // The thread is a strip under the room, and its newest post is in view.
  const vh = page.viewportSize().height;
  const box = await rect(page, '.dossier');
  expect(box.height).toBeLessThanOrEqual(vh * 0.4 + 2);
  const last = await rect(page, '#thread-log .thread-post:last-of-type');
  expect(last.bottom).toBeLessThanOrEqual(box.bottom);
  expect(last.top).toBeGreaterThanOrEqual(box.top);
});

test('read_thread_opens_a_closed_notebook', async ({ page }) => {
  await start(page);
  const state = await (await page.request.get('/api/state')).json();
  const res = await page.request.post('/api/continue', { data: { sessionId: state.session.id, revision: state.session.revision } });
  expect(res.status()).toBe(200);
  await page.reload();
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.locator('#dialogue-close').click();
  await expect(page.locator('.dossier')).toBeHidden();
  await page.locator('#read-thread').click();
  await expect(page.locator('.dossier')).toBeVisible();
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(1);
});

for (const viewport of [{ width: 1728, height: 864 }, { width: 1440, height: 900 }]) {
  test(`back_row_bubble_whole_lines_below_topbar at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // A long line from Ken (back row, the least room above his tag).
    const long = 'I keep going over it in my head and I still think the lighting in those old photos is far too perfect. '.repeat(3);
    await page.route('**/api/continue', async route => {
      // Ask for the plain JSON view (no stream flag) so the line can be rewritten whole.
      const res = await route.fetch({ postData: JSON.stringify({ ...route.request().postDataJSON(), stream: false }) });
      const data = await res.json();
      const line = data.session.thread.at(-1);
      if (line) { line.text = long; line.character = 'ken'; }
      await route.fulfill({ response: res, json: data });
    });
    await start(page);
    await page.locator('#continue-button').click();
    const bubble = page.locator('.roundtable-bubble[data-actor="ken"]');
    await expect(bubble).toBeVisible();
    const bar = await rect(page, '.topbar');
    expect((await rect(page, '.roundtable-bubble')).top).toBeGreaterThanOrEqual(bar.bottom);
    const text = await bubble.locator('span').evaluate(el => ({
      client: el.clientHeight, scroll: el.scrollHeight, line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    // Whole lines only (the old box cut lines in half), at least one, and the rest is clamped (the thread has it all).
    const lines = text.client / text.line;
    expect(Math.abs(lines - Math.round(lines))).toBeLessThan(0.05);
    expect(Math.round(lines)).toBeGreaterThanOrEqual(1);
    expect(text.scroll).toBeGreaterThan(text.client);
  });
}
