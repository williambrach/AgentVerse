import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardRows, renderBoard } from '../server/admin/board.js';
import { systemLine } from '../server/admin/controls.js';

class El {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.className = ''; this._text = ''; this.listeners = {}; this.attrs = {}; this.dataset = {}; this.hidden = false; this.parent = null; }
  _adopt(c) { c.remove(); c.parent = this; }
  appendChild(c) { this._adopt(c); this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  insertBefore(c, ref) { this._adopt(c); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(t, f) { this.listeners[t] = f; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}
const makeDoc = () => { const d = {}; d.createElement = (t) => new El(t, d); return d; };
const find = (el, pred, out = []) => { if (pred(el)) out.push(el); el.children.forEach((c) => find(c, pred, out)); return out; };
const rowOf = (root, id) => find(root, (e) => e.className.split(' ').includes('board-row') && e.dataset.team === id)[0];
const btn = (root, sel) => find(root, (e) => e.tagName === 'button' && Object.entries(sel).every(([k, v]) => e.dataset[k] === v))[0];

const team = (o) => ({ rank: 1, teamId: 'aaaa', name: 'Owls', points: 2, played: 1, timeMs: 754000, coins: 3, hidden: false, you: false, ...o });
const snap = (teams, rankBy = 'time') => ({ leaderboard: { rankBy, startedAt: 0, teams } });

test('boardRows formats rank, points, time, coins', () => {
  const rows = boardRows(snap([team({}), team({ teamId: 'b', name: 'Cats', rank: null, points: 1, timeMs: 61000, coins: 0, hidden: true })]));
  assert.deepEqual(rows[0], { teamId: 'aaaa', name: 'Owls', rank: '1', points: '2 pts', played: 1, time: '12:34', coins: '3', hidden: false });
  assert.equal(rows[1].rank, '–');
  assert.equal(rows[1].points, '1 pt');
  assert.equal(rows[1].time, '1:01');
  assert.equal(rows[1].hidden, true);
  assert.deepEqual(boardRows({ leaderboard: null }), []);
});

test('empty board shows the empty text; rows hide it', () => {
  const root = new El('section', makeDoc());
  renderBoard(root, { leaderboard: null }, { api: async () => ({}) });
  const empty = find(root, (e) => e.className === 'board-empty')[0];
  assert.equal(empty.textContent, 'No team has finished a case this round.');
  assert.equal(empty.hidden, false);
  renderBoard(root, snap([team({})]), { api: async () => ({}) });
  assert.equal(empty.hidden, true);
  assert.ok(root.textContent.includes('New round empties the board.'));
});

test('rank toggle reflects rankBy and posts', async () => {
  const root = new El('section', makeDoc());
  const calls = [];
  const api = async (p, b) => { calls.push([p, b]); return snap([team({})], 'coins').leaderboard; };
  renderBoard(root, snap([team({})]), { api });
  assert.equal(btn(root, { rankBy: 'time' }).attrs['aria-pressed'], 'true');
  assert.equal(btn(root, { rankBy: 'coins' }).attrs['aria-pressed'], 'false');
  await btn(root, { rankBy: 'coins' }).listeners.click();
  assert.deepEqual(calls, [['/admin/leaderboard', { rankBy: 'coins' }]]);
  assert.equal(btn(root, { rankBy: 'coins' }).attrs['aria-pressed'], 'true');
});

test('hide and show post and repaint; hidden rows get the class', async () => {
  const root = new El('section', makeDoc());
  const calls = [];
  let hidden = false;
  const api = async (p, b) => { calls.push([p, b]); hidden = b.hidden; return snap([team({ hidden })]).leaderboard; };
  renderBoard(root, snap([team({})]), { api });
  const hide = btn(root, { action: 'hide' });
  assert.equal(hide.textContent, 'Hide');
  await hide.listeners.click();
  assert.deepEqual(calls[0], ['/admin/teams/hidden', { teamId: 'aaaa', hidden: true }]);
  assert.ok(rowOf(root, 'aaaa').className.includes('hidden-team'));
  assert.equal(btn(root, { action: 'show' }), hide, 'same button node, relabelled');
  assert.equal(hide.textContent, 'Show');
  await hide.listeners.click();
  assert.deepEqual(calls[1], ['/admin/teams/hidden', { teamId: 'aaaa', hidden: false }]);
  assert.ok(!rowOf(root, 'aaaa').className.includes('hidden-team'));
});

test('ticks update in place: same nodes, reordered, removed rows go', () => {
  const root = new El('section', makeDoc());
  const o = { api: async () => ({}) };
  renderBoard(root, snap([team({}), team({ teamId: 'b', name: 'Cats', rank: 2 })]), o);
  const a = rowOf(root, 'aaaa'); const b = rowOf(root, 'b');
  renderBoard(root, snap([team({ teamId: 'b', name: 'Cats', rank: 1 }), team({ rank: 2, points: 5 })]), o);
  assert.equal(rowOf(root, 'aaaa'), a);
  assert.equal(rowOf(root, 'b'), b);
  const list = find(root, (e) => e.className === 'board-list')[0];
  assert.deepEqual(list.children.map((c) => c.dataset.team), ['b', 'aaaa']);
  assert.ok(a.textContent.includes('5 pts'));
  renderBoard(root, snap([team({})]), o);
  assert.equal(rowOf(root, 'b'), undefined);
});

test('team names stay literal text', () => {
  const root = new El('section', makeDoc());
  renderBoard(root, snap([team({ name: '<img src=x onerror=1>' })]), { api: async () => ({}) });
  const n = find(root, (e) => e.className === 'board-name')[0];
  assert.equal(n.textContent, '<img src=x onerror=1>');
  assert.equal(n.children.length, 0);
});

test('failed action shows an error', async () => {
  const root = new El('section', makeDoc());
  renderBoard(root, snap([team({})]), { api: async () => { throw new Error('nope'); } });
  await btn(root, { action: 'hide' }).listeners.click();
  assert.equal(find(root, (e) => e.className === 'board-error')[0].textContent, 'Error: nope');
});

test('systemLine for leaderboard records', () => {
  const fmt = () => '10:00';
  assert.equal(systemLine({ type: 'leaderboard_settings', rankBy: 'coins', timestamp: 1 }, fmt), '10:00 leaderboard ties by coins');
  assert.equal(systemLine({ type: 'team_hidden', teamId: 'abcdef123456', hidden: true, timestamp: 1 }, fmt), '10:00 team abcdef12 hidden');
  assert.equal(systemLine({ type: 'team_hidden', teamId: 'abcdef123456', hidden: false, timestamp: 1 }, fmt), '10:00 team abcdef12 shown');
});
