import test from 'node:test';
import assert from 'node:assert/strict';
import { worlds } from '../server/worlds.mjs';
import { economyRules, createWallet, quote, spend, minimumBudget } from '../server/economy.mjs';

const COSTS = { ask: 2, inspect: 5, continue: 1 };
const fresh = (opts = { budget: 15 }) => createWallet(economyRules(opts));

test('rules_defaults', () => {
  assert.deepEqual(economyRules(), { budget: null, costs: COSTS, charges: { inspect: 1, continue: 3 } });
  assert.deepEqual(economyRules({ budget: 15, inspect: 2 }), { budget: 15, costs: COSTS, charges: { inspect: 2, continue: 3 } });
});

test('wallet_shape', () => {
  assert.deepEqual(fresh(), { budget: 15, spent: 0, costs: COSTS,
    charges: { inspect: { max: 1, used: 0 }, continue: { max: 3, used: 0 } } });
});

test('quote_examples', () => {
  assert.deepEqual(quote(fresh(), ['ask', 'continue'], 4), { cost: 3, ok: true, reason: null });
  const w = fresh(); w.charges.continue.used = 3;
  assert.deepEqual(quote(w, ['ask', 'continue'], 0), { cost: 3, ok: false, reason: 'No conversations left.' });
  const w2 = fresh(); w2.spent = 12;
  assert.deepEqual(quote(w2, ['inspect'], 0), { cost: 5, ok: false, reason: 'Not enough coins: this costs 5 and you have 3 left.' });
  const w3 = fresh({ budget: 10 }); w3.spent = 6;
  assert.deepEqual(quote(w3, ['continue'], 4), { cost: 1, ok: false, reason: 'Save coins: you need 4 to ask everyone once.' });
});

test('quote_order_charges_before_budget', () => {
  const w = fresh(); w.spent = 15; w.charges.inspect.used = 1;
  assert.equal(quote(w, ['inspect'], 9).reason, 'No reasoning inspections left.');
  const c = fresh(); c.charges.continue.used = 3;
  assert.equal(quote(c, ['continue'], 0).reason, 'No conversations left.');
});

test('no_budget_never_fails_on_coins', () => {
  const w = fresh({}); w.spent = 5000;
  assert.deepEqual(quote(w, ['inspect'], 100), { cost: 5, ok: true, reason: null });
});

test('quote_does_not_mutate', () => {
  const w = fresh(); const before = structuredClone(w);
  quote(w, ['ask', 'continue'], 4);
  assert.deepEqual(w, before);
});

test('spend_updates_spent_and_charges_only', () => {
  const w = fresh();
  assert.deepEqual(spend(w, ['ask', 'continue']), { tools: ['ask', 'continue'], cost: 3, total: 3 });
  assert.equal(w.charges.continue.used, 1);
  assert.equal(w.spent, 3);
  const before = structuredClone(w);
  assert.deepEqual(spend(w, ['ask']), { tools: ['ask'], cost: 2, total: 5 });
  assert.deepEqual(w.charges, before.charges);
  assert.equal(w.budget, 15);
});

test('unknown_tool_clue_throws', () => {
  assert.throws(() => quote(fresh(), ['clue'], 0), { message: 'Unknown tool: clue' });
  assert.throws(() => spend(fresh(), ['clue']), { message: 'Unknown tool: clue' });
});

test('budget_floor_fits_cast', () => {
  const most = Math.max(...Object.values(worlds).map(w => w.agents));
  assert.equal(minimumBudget(), COSTS.ask * most);
  // The floor budget still asks every agent once.
  const w = createWallet(economyRules({ budget: minimumBudget() }));
  for (let i = 0; i < most; i++) { assert.equal(quote(w, ['ask'], (most - i - 1) * COSTS.ask).ok, true); spend(w, ['ask']); }
});
