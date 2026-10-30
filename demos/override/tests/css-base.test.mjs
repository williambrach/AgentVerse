import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../client/${f}`, import.meta.url), 'utf8');

test('fonts.css self-hosts the one font with its licence', () => {
  const css = read('fonts.css');
  assert.ok(!/https?:\/\//.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no remote source');
  const faces = css.match(/@font-face/g) ?? [];
  assert.equal(faces.length, 2);
  assert.ok(css.includes('font-display: swap'));
  assert.ok(css.includes('font-weight: 200 800'));
  for (const f of css.matchAll(/url\('\.\/(fonts\/[^']+\.woff2)'\)/g)) assert.ok(existsSync(new URL(`../client/${f[1]}`, import.meta.url)), f[1]);
  assert.equal([...css.matchAll(/url\('\.\/fonts\//g)].length, 2);
  assert.ok(read('fonts/OFL.txt').includes('SIL Open Font License'));
  assert.ok(read('main.ts').startsWith("import './fonts.css';"), 'loaded before every other stylesheet');
});

test('style.css holds the tokens and the one font', () => {
  const css = read('style.css');
  for (const t of ['#0F1B22', '#0B151B', '#13232C', '#355A6B', '#F4EBD3', '#A9BEC6', '#F4B740', '#5CC8F5', '#FFF6DE', '#18252D', '#D9C796',
    '#6DBE63', '#A68BE0', '#F08A3C', '#EA6A55', '#8CC56A', '#BFE0EE', '#A7CF7E', '#B9A2EE', '#DCD3F2', '#A99BD0']) {
    assert.ok(css.toUpperCase().includes(t), t);
  }
  assert.ok(css.includes("'Atkinson Hyperlegible Next'"));
  assert.ok(!/@import|https?:\/\//.test(css), 'no web font import');
  assert.ok(Buffer.byteLength(css) < 6000);
  for (const c of ['.primary-button', '.secondary-button', '.quiet-button', '.eyebrow', '.sr-only', '.fine-print', '.board-empty', '#toast', '.access-screen'])
    assert.ok(css.includes(c), c);
});

test('the layered stylesheets are gone and stage.css carries the labels', () => {
  for (const f of ['pixel.css', 'fit.css', 'tower.css']) assert.ok(!existsSync(new URL(`../client/${f}`, import.meta.url)), f);
  const css = read('stage.css');
  for (const c of ['.station-labels', '.station-label', '.station-prompt']) assert.ok(css.includes(c), c);
});

test('sprites_all_slots: .monkey-face has art for slots 0 to 4 in both worlds', () => {
  const css = read('banana.css');
  assert.ok(/\.monkey-face \{[^}]*monkeys\.png/.test(css));
  assert.ok(css.includes('.monkey-face.slot-1') && css.includes('.monkey-face.slot-2'));
  assert.ok(/\[data-world="tower"\] \.monkey-face \{[^}]*apprentices\.png/.test(css));
  for (const world of ['grove', 'tower']) for (const i of [3, 4]) {
    assert.ok(css.includes(`--face-sheet-${world}-${i}`), `${world} ${i}`);
    assert.ok(css.includes(`html [data-world="${world}"] .slot-${i}.monkey-face`) || world === 'grove', `${world} ${i} page`);
  }
  assert.ok(!css.includes('avatar-dot'));
});

test('#app pads only once the HUD is up, and the lineup beats the page rules without !important', () => {
  const hud = read('hud.css'), dialogue = read('dialogue.css');
  const rule = (css, selector) => { const at = css.indexOf(`${selector} {`); assert.ok(at >= 0, selector); return css.slice(at, css.indexOf('}', at)); };
  assert.match(rule(hud, '#app'), /padding: 0;/);
  assert.match(rule(hud, '#app[data-hud]'), /padding: 16px/);
  const lineup = rule(hud, '#app[data-view="lineup"] .dossier');
  assert.doesNotMatch(lineup, /!important/);
  assert.match(lineup, /position: fixed/);
  // The page rules that would out-rank it step aside in the lineup instead.
  for (const selector of ['#app:not([data-view="lineup"]) .dossier:not(:has(.dialogue))', '#app[data-hud]:not([data-view="lineup"]) .dossier:not(:has(.dialogue))'])
    assert.ok(dialogue.includes(`${selector} {`), selector);
  assert.match(rule(dialogue, '#app[data-hud] .dossier:has(.dialogue) .dossier-close'), /position: absolute; top: \d+px; right: \d+px/);
});
