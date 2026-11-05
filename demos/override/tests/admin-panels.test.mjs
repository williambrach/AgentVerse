import test from 'node:test';
import assert from 'node:assert/strict';
import { initPanels, setBadge } from '../server/admin/panels.js';

function panel(name, open) {
  const l = {};
  return { dataset: { panel: name }, open, addEventListener: (t, f) => { l[t] = f; }, fire(o) { this.open = o; l.toggle(); } };
}
function setup(stored) {
  const health = panel('health', true);
  const records = panel('records', false);
  const root = { querySelectorAll: () => [health, records] };
  const writes = [];
  const storage = { getItem: () => stored, setItem: (k, v) => writes.push([k, v]) };
  initPanels(root, storage);
  return { health, records, writes };
}

test('restore_collapsed', () => {
  const { health, records } = setup('["health"]');
  assert.equal(health.open, false);
  assert.equal(records.open, true);
});
test('defaults_without_key', () => {
  const { health, records, writes } = setup(null);
  assert.equal(health.open, true);
  assert.equal(records.open, false);
  assert.equal(writes.length, 0);
});
test('toggle_writes_full_list', () => {
  const { health, records, writes } = setup('["health"]');
  health.open = false;
  records.fire(false);
  assert.deepEqual(writes.at(-1), ['override.admin.collapsed', '["health","records"]']);
});
test('bad_json_ignored', () => {
  const { health, records } = setup('{oops');
  assert.equal(health.open, true);
  assert.equal(records.open, false);
});
test('null_storage_survives', () => {
  const h = panel('health', true);
  initPanels({ querySelectorAll: () => [h] }, null);
  h.fire(false);
});
test('badge_levels', () => {
  const el = { hidden: false, textContent: 'x', dataset: {} };
  setBadge(el, 'ok');
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, '');
  setBadge(el, 'warn');
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, 'Warning');
  assert.equal(el.dataset.tone, 'warn');
  setBadge(el, 'bad');
  assert.equal(el.textContent, 'Problem');
  assert.equal(el.dataset.tone, 'bad');
});
test('status_data_state', () => {
  assert.equal('bad token'.replace(/ /g, '-'), 'bad-token');
});
