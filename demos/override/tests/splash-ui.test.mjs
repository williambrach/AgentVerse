import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { SPONSORS, SPLASH_KEY, wantSplash, splashMarkup, skipsSplash } from '../client/splash.ts';

const q = search => new URLSearchParams(search);
const key = (k, over = {}) => ({ key: k, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...over });

test('plays on the first open only, unless the URL asks', () => {
  assert.equal(wantSplash(q(''), false), true);
  assert.equal(wantSplash(q(''), true), false);
  assert.equal(wantSplash(q('?splash=1'), true), true);
  assert.equal(wantSplash(q('?splash'), true), true);
  assert.equal(wantSplash(q('?splash=0'), false), false);
  assert.equal(wantSplash(q('?case=factory-escape'), false), true);
});

test('the big screen never plays it', () => {
  assert.equal(wantSplash(q('?view=board'), false), false);
  assert.equal(wantSplash(q('?view=board&splash=1'), false), false);
});

test('three sponsors in order, each with a shipped file and alt text', () => {
  assert.deepEqual(SPONSORS.map(s => s.id), ['dfm', 'sdu', 'ucloud']);
  for (const s of SPONSORS) {
    const file = new URL(`../public${s.src}`, import.meta.url);
    assert.ok(existsSync(file), `${s.src} ships in public/`);
    assert.ok(statSync(file).size > 500, `${s.src} is not empty`);
    assert.ok(s.name.length > 2);
  }
});

test('markup: logos in order, title card, skip button, names escaped', () => {
  const html = splashMarkup();
  const order = [...html.matchAll(/data-sponsor="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['dfm', 'sdu', 'ucloud']);
  assert.match(html, /alt="Danish Foundation Models"/);
  assert.match(html, /<h1>Arbiter<span class="splash-dot">\.<\/span><\/h1>/);
  assert.equal((html.match(/class="splash-pip"/g) || []).length, 3, 'one pip per sponsor');
  assert.match(html, /<b>01<\/b> \/ 03/);
  assert.doesNotMatch(html, /splash-face|splash-palm|splash-cast/, 'no cast row or palms');
  assert.match(html, /Press any key to start/);
  assert.match(html, /id="splash-skip"/);
  assert.match(splashMarkup([{ id: 'x', name: '<b>"A&B"</b>', src: '/s.png', label: '<i>' }]), /alt="&lt;b&gt;&quot;A&amp;B&quot;&lt;\/b&gt;".*&lt;i&gt;/);
});

test('any plain key skips; modifiers, Tab, repeats and shortcuts do not', () => {
  for (const k of ['Enter', ' ', 'a', 'Escape', 'ArrowRight']) assert.equal(skipsSplash(key(k)), true, k);
  for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'Tab']) assert.equal(skipsSplash(key(k)), false, k);
  assert.equal(skipsSplash(key('r', { metaKey: true })), false);
  assert.equal(skipsSplash(key('r', { ctrlKey: true })), false);
  assert.equal(skipsSplash(key('Enter', { repeat: true })), false);
});

test('the storage key matches the Playwright config, so other specs skip the intro', () => {
  const config = readFileSync(new URL('../playwright.config.mjs', import.meta.url), 'utf8');
  assert.equal(SPLASH_KEY, 'override.splash');
  assert.match(config, /name: 'override\.splash', value: 'seen'/);
});

test('reduced motion turns the fades off', () => {
  const css = readFileSync(new URL('../client/splash.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('function keys (F5 reload, F12 devtools) are left to the browser', () => {
  for (const k of ['F1', 'F5', 'F11', 'F12']) assert.equal(skipsSplash(key(k)), false, k);
});
