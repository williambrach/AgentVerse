import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../server/admin/theme.js', import.meta.url), 'utf8');
function load(stored, withButton = true) {
  const store = new Map(stored === undefined ? [] : [['override.admin.theme', stored]]);
  const listeners = {}; const click = [];
  const btn = { textContent: 'Light mode', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { click.push(f); } };
  const document = {
    documentElement: { dataset: {} },
    getElementById: (id) => (withButton && id === 'theme-toggle' ? btn : null),
    addEventListener: (t, f) => { listeners[t] = f; },
  };
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  vm.runInNewContext(src, { document, localStorage });
  return { document, store, btn, ready: () => listeners.DOMContentLoaded(), click: () => click[0]() };
}

test('default is dark', () => assert.equal(load().document.documentElement.dataset.theme, 'dark'));
test('stored light is applied', () => assert.equal(load('light').document.documentElement.dataset.theme, 'light'));
test('bad value gives dark', () => assert.equal(load('purple').document.documentElement.dataset.theme, 'dark'));
test('toggle saves and relabels', () => {
  const t = load();
  t.ready();
  assert.equal(t.btn.textContent, 'Light mode');
  assert.equal(t.btn.attrs['aria-pressed'], 'false');
  t.click();
  assert.equal(t.document.documentElement.dataset.theme, 'light');
  assert.equal(t.store.get('override.admin.theme'), 'light');
  assert.equal(t.btn.textContent, 'Dark mode');
  assert.equal(t.btn.attrs['aria-pressed'], 'true');
  t.click();
  assert.equal(t.store.get('override.admin.theme'), 'dark');
  assert.equal(t.btn.textContent, 'Light mode');
});
test('stored light labels the button on load; missing button is fine', () => {
  const t = load('light'); t.ready();
  assert.equal(t.btn.textContent, 'Dark mode');
  load(undefined, false).ready();
});

// Contrast of status text on the surfaces and tinted backgrounds it sits on (WCAG AA, 4.5).
const css = readFileSync(new URL('../server/admin/app.css', import.meta.url), 'utf8');
function tokens(selector) {
  const start = css.indexOf(selector + ' {');
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [m[1], m[2]]));
}
const rgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const tint = (fg, bg) => fg.map((v, i) => v * 0.12 + bg[i] * 0.88);
for (const [name, sel] of [['dark', ':root'], ['light', ':root[data-theme="light"]']]) {
  test(`${name} theme: status colours stay readable on surfaces and tints`, () => {
    const t = { ...tokens(':root'), ...(name === 'light' ? tokens(sel) : {}) };
    for (const k of ['ok', 'warn', 'bad']) {
      const fg = rgb(t[k]);
      for (const bg of ['surface', 'bg', 'surface-2']) assert.ok(ratio(fg, rgb(t[bg])) >= 4.5, `${k} on ${bg}`);
      assert.ok(ratio(fg, tint(fg, rgb(t.surface))) >= 4.5, `${k} on its tint over surface`);
      assert.ok(ratio(fg, tint(fg, rgb(t.bg))) >= 4.5, `${k} on its tint over page`);
    }
    for (const k of ['muted', 'dim', 'accent']) assert.ok(ratio(rgb(t[k]), rgb(t.surface)) >= 4.5, k);
    assert.ok(ratio(rgb(t['accent-ink']), rgb(t.accent)) >= 4.5, 'primary button text');
  });
}
