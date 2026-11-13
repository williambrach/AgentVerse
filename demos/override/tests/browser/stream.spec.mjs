import { test, expect } from './team.mjs';
import { castOf, sessionIdOf } from './cast.mjs';
import kase from '../../server/cases/renaissance-traveler.mjs';

// Runs against scripts/stream-e2e.mjs (project `stream`): the real server in live mode over a mock LLM that streams.
// The control port (4328) sets what the mock says and how fast; tests run one at a time, each sets its own mode first.
const CTL = 'http://127.0.0.1:4328/ctl';
const DATA = 'test-results/sessions-stream';
const QUESTION = 'How do you spend your evenings?';
const CLEAN = 'I spend my evenings at the fountain watching the pigeons argue over crumbs while the old men of the square tell the same tales again and again.';
const COUNTER = '#coin-counter .coin-num';

const control = (page, body) => page.request.post(CTL, { data: body }).then(r => expect(r.ok()).toBe(true));

// A returning team in the Castelvento case with the dialogue of a local (never the traveller) open and the input ready.
async function start(page) {
  await page.goto('/?case=renaissance-traveler');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  const cast = castOf(await sessionIdOf(page), DATA);
  const local = Object.keys(cast).find(id => cast[id] !== 'traveler' && kase.characters.some(c => c.id === id));
  await page.locator(`#room-nav [data-go="${local}"]`).click();
  await expect(page.locator('#question')).toBeEnabled({ timeout: 12_000 });
  return local;
}

const ask = async page => {
  await page.locator('#question').fill(QUESTION);
  await page.keyboard.press('Enter');
};

// Records every text the live answer node shows, in order, from inside the page (a poll would miss states).
const record = page => page.evaluate(() => {
  const seen = (window.__answerSeen = []);
  const note = () => {
    const text = document.querySelector('[data-stream="answer"]')?.textContent ?? '';
    if (text && seen[seen.length - 1] !== text) seen.push(text);
  };
  new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
});
const seenTexts = page => page.evaluate(() => window.__answerSeen);
const committed = page => page.locator('#transcript .speech.character:not(.waiting)');

test('stream_typing_reveal: the answer grows in the live bubble before the turn commits', async ({ page }) => {
  await control(page, { mode: 'ok', content: CLEAN, reasoning: null, streamChunkMs: 150, delayMs: [30, 60] });
  await start(page);
  await record(page);
  await ask(page);
  const bubble = page.locator('[data-stream-bubble]');
  await expect(bubble).toHaveClass(/streaming/, { timeout: 10_000 });
  await expect(page.locator('[data-stream="answer"]')).not.toBeEmpty();
  await expect(page.locator('.stream-caret')).toHaveCount(1);
  // The committed turn is not there yet while text is still arriving.
  expect(await page.locator('#transcript .speech.character', { hasText: CLEAN.slice(-30) }).count()).toBe(0);
  await expect(bubble).toHaveCount(0, { timeout: 20_000 });
  await expect(committed(page).last()).toContainText(CLEAN.slice(0, 40));
  const seen = await seenTexts(page);
  expect(new Set(seen).size).toBeGreaterThanOrEqual(2);
  expect(seen.some(text => text.length > 0 && text.length < CLEAN.length)).toBe(true);
  await expect(page.locator('#interview-form .ask-button')).toBeEnabled();
});

test('stream_watch_live: Watch shows reasoning before the commit and costs nothing until then', async ({ page }) => {
  const reasoning = 'The fountain crowd matters. Think about the evening, the pigeons and what to say.';
  await control(page, { mode: 'ok', content: `${CLEAN} ${CLEAN}`, reasoning, streamChunkMs: 250, delayMs: [30, 60] });
  await start(page);
  const before = await page.locator(COUNTER).innerText();
  await ask(page);
  await expect(page.locator('[data-stream-bubble]')).toHaveClass(/streaming/, { timeout: 10_000 });
  const watch = page.locator('#inspect-button');
  await expect(watch).toContainText('Watch');
  await expect(watch).toBeEnabled({ timeout: 10_000 });
  await watch.click();
  await expect(page.locator('[data-stream="reasoning"]')).toContainText('fountain', { timeout: 10_000 });
  // Still streaming: the turn has not committed and the coin counter has not moved.
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(1);
  expect(await page.locator(COUNTER).innerText()).toBe(before);
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(0, { timeout: 30_000 });
  await expect(committed(page).last()).toContainText(CLEAN.slice(0, 40));
  await expect(page.locator(COUNTER)).not.toHaveText(before);
});

test('stream_scrub_on_guard_retry: a first attempt with a word from home never shows once the retry text appears', async ({ page }) => {
  const dirty = 'We drink tea by the old fountain every evening, and the pigeons share our bread until the bells ring out.';
  await control(page, { mode: 'ok', content: CLEAN, reasoning: null, streamChunkMs: 150, delayMs: [30, 60], queue: [dirty, CLEAN] });
  await start(page);
  await record(page);
  await ask(page);
  await expect(page.locator('[data-stream-bubble]')).toHaveClass(/streaming/, { timeout: 10_000 });
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(0, { timeout: 40_000 });
  await expect(committed(page).last()).toContainText(CLEAN.slice(0, 40));
  const seen = await seenTexts(page);
  const word = /\btea\b/;
  const firstClean = seen.findIndex(text => text.startsWith('I spend'));
  expect(firstClean).toBeGreaterThan(0); // the retry text did appear, after the first attempt
  expect(seen.slice(0, firstClean).some(text => word.test(text))).toBe(true); // the false start was real
  for (const text of seen.slice(firstClean)) expect(text).not.toMatch(word);
  expect(await committed(page).last().innerText()).not.toMatch(word);
});

test('stream_fail_line: a provider failure shows the error and Ask works again', async ({ page }) => {
  await control(page, { mode: 'error500', content: CLEAN, reasoning: null, streamChunkMs: 50, delayMs: [10, 20] });
  await start(page);
  await ask(page);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 30_000 });
  expect((await page.locator('#toast').innerText()).trim().length).toBeGreaterThan(0);
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(0);
  await expect(page.locator('#question')).toHaveValue(QUESTION);
  await expect(page.locator('#interview-form .ask-button')).toBeEnabled();
  await control(page, { mode: 'ok', content: CLEAN, streamChunkMs: 20, delayMs: [10, 20] });
  await page.locator('#interview-form .ask-button').click();
  await expect(committed(page).last()).toContainText(CLEAN.slice(0, 40), { timeout: 20_000 });
  await expect(page.locator('#toast')).toBeHidden();
});

test('stream_one_at_a_time: nothing can send a second message while an answer streams, and the server refuses a forced one', async ({ page }) => {
  const long = `${CLEAN} ${CLEAN} ${CLEAN}`;
  await control(page, { mode: 'ok', content: long, reasoning: null, streamChunkMs: 300, delayMs: [30, 60] });
  const sent = [];
  page.on('request', req => { if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/interview') sent.push(req.postData() ?? ''); });
  const local = await start(page);
  const sessionId = await sessionIdOf(page);
  const form = page.locator('#interview-form');
  const ASK = form.locator('.ask-button');
  const lockedControls = async () => {
    await expect(ASK).toBeDisabled();
    await expect(page.locator('#question')).toBeDisabled();
    for (const chip of await form.locator('[data-quick-question], .topic-chips button:not([aria-pressed="true"]), .next-monkey').all()) await expect(chip).toBeDisabled();
  };
  // The first question: the quick question is on screen (no turns yet), and everything else locks while the answer streams.
  expect(await form.locator('[data-quick-question], [data-topic]').count()).toBeGreaterThan(0);
  const before = await committed(page).count(); // any opening line the character already has
  await ask(page);
  await expect(page.locator('[data-stream-bubble]')).toHaveClass(/streaming/, { timeout: 10_000 });
  await lockedControls();
  expect(sent).toHaveLength(1);

  // Every way to send a second one: keys, clicks (forced past the disabled state), and synthetic Enter on the textarea.
  await page.keyboard.press('Enter');
  await ASK.click({ force: true });
  for (const chip of await form.locator('[data-quick-question], [data-topic]:not([aria-pressed="true"])').all()) await chip.click({ force: true });
  await page.locator('#question').dispatchEvent('keydown', { key: 'Enter' });
  await page.locator('#question').dispatchEvent('keydown', { key: 'Enter' });
  await page.waitForTimeout(400);
  expect(sent).toHaveLength(1);
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(1);

  // A forced second POST straight at the server is refused while the first interview runs.
  const forced = await page.evaluate(async ({ sessionId, local, question }) => {
    const r = await fetch('/api/interview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, character: local, question }) });
    return { status: r.status, body: await r.text() };
  }, { sessionId, local, question: 'Who do you trust here?' });
  expect(forced.status).toBe(409);
  expect(forced.body).toMatch(/still in progress/i);
  expect(sent).toHaveLength(2); // the forced fetch is the only extra request

  // The first answer still commits whole, and Ask comes back.
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(0, { timeout: 40_000 });
  await expect(committed(page)).toHaveCount(before + 1);
  await expect(committed(page).last()).toContainText(CLEAN.slice(0, 40));
  expect(await committed(page).last().innerText()).toContain(long.slice(-40));
  await expect(ASK).toBeEnabled();
  await expect(page.locator('#question')).toBeEnabled();

  // A second question works, and "next" is locked during it too.
  await control(page, { mode: 'ok', content: long, reasoning: null, streamChunkMs: 300, delayMs: [30, 60] });
  await page.locator('#question').fill('And what do you make of the strangers?');
  await ASK.click();
  await expect(page.locator('[data-stream-bubble]')).toHaveClass(/streaming/, { timeout: 10_000 });
  await lockedControls();
  expect(await form.locator('.next-monkey').count()).toBe(1);
  await page.locator('.next-monkey').click({ force: true });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(sent).toHaveLength(3);
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(0, { timeout: 40_000 });
  await expect(committed(page)).toHaveCount(before + 2);
  await expect(ASK).toBeEnabled();
});

test('stream_talk_line: Let them talk types the line into a live thread post, then commits it', async ({ page }) => {
  await control(page, { mode: 'ok', content: CLEAN, reasoning: null, streamChunkMs: 200, delayMs: [30, 60] });
  await start(page);
  await record(page);
  await expect(page.locator('#continue-button')).toBeEnabled();
  await page.locator('#continue-button').click();
  const live = page.locator('#thread-log .thread-post[data-stream-bubble]');
  await expect(live).toHaveCount(1, { timeout: 10_000 });
  await expect(live).toHaveClass(/streaming/, { timeout: 10_000 });
  await expect(live.locator('[data-stream="answer"]')).not.toBeEmpty();
  await expect(live.locator('.stream-caret')).toHaveCount(1);
  await expect(live.locator('.thread-author')).toContainText('#1 ');
  // The stage bubble follows the typed text; no committed post exists yet, and no Watch turns on for a talk line.
  await expect(page.locator('.station-bubble')).toBeVisible();
  expect(await page.locator('#thread-log .thread-post:not([data-stream-bubble])').count()).toBe(0);
  await expect(page.locator('#inspect-button')).not.toContainText('Watch');
  await expect(page.locator('#thread-log [data-stream-bubble]')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('#thread-log .thread-post').first()).toContainText(CLEAN.slice(0, 40));
  const seen = await seenTexts(page);
  expect(new Set(seen).size).toBeGreaterThanOrEqual(2);
  expect(seen.some(text => text.length > 0 && text.length < CLEAN.length)).toBe(true);
});

test('stream_talk_fail: a talk line that fails mid-stream leaves no fragment on stage and Let them talk works again', async ({ page }) => {
  await control(page, { mode: 'ok', content: CLEAN, reasoning: null, streamChunkMs: 20, delayMs: [10, 20] });
  const local = await start(page);
  // /api/continue answers an NDJSON stream from inside the page: speaker, start, a delta, then (after a pause) a fail line.
  await page.evaluate(speaker => {
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!String(input).endsWith('/api/continue')) return real(input, init);
      const enc = new TextEncoder();
      const line = obj => enc.encode(JSON.stringify(obj) + '\n');
      const body = new ReadableStream({
        async start(ctl) {
          ctl.enqueue(line({ t: 'speaker', character: speaker, round: 1, line: 1, roundLines: 5 }));
          ctl.enqueue(line({ t: 'start', a: 'c1', attempt: 1, endpoint: 'a' }));
          ctl.enqueue(line({ t: 'delta', a: 'c1', text: 'I was about to say something about the' }));
          await new Promise(r => setTimeout(r, 1500));
          ctl.enqueue(line({ t: 'fail', status: 502, error: 'The mock thread broke off.' }));
          ctl.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
    };
  }, local);
  await expect(page.locator('#continue-button')).toBeEnabled();
  await page.locator('#continue-button').click();
  // The fragment really was on stage before the failure.
  await expect(page.locator('#thread-log [data-stream-bubble]')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator('.station-bubble')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#toast')).toContainText('The mock thread broke off.', { timeout: 10_000 });
  await expect(page.locator('.station-bubble')).toHaveCount(0);
  await expect(page.locator('[data-stream-bubble]')).toHaveCount(0);
  expect(await page.locator('#thread-log .thread-post').count()).toBe(0);
  await expect(page.locator('#continue-button')).toBeEnabled();
});
