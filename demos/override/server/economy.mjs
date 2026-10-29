import { worlds } from './worlds.mjs';

// Coin and charge rules. Pure: no I/O. quote() never mutates; spend() changes only spent and charges.

const COSTS = { ask: 2, inspect: 5, continue: 1 };
const LABELS = { inspect: 'reasoning inspections', continue: 'conversations' };

// A game must be able to ask every agent once, in the largest registered world.
export const minimumBudget = () => COSTS.ask * Math.max(...Object.values(worlds).map(w => w.agents));

export function economyRules(env = {}) {
  const rawBudget = String(env.OVERRIDE_COIN_BUDGET ?? '').trim();
  let budget = null;
  if (rawBudget !== '') {
    const n = Number(rawBudget);
    const min = minimumBudget();
    if (!/^\d+$/.test(rawBudget) || n < min || n > 999) {
      throw new Error(`OVERRIDE_COIN_BUDGET must be an integer between ${min} and 999.`);
    }
    budget = n;
  }
  const rawCharges = String(env.OVERRIDE_REASONING_CHARGES ?? '').trim();
  let inspect = 1;
  if (rawCharges !== '') {
    if (rawCharges !== '1' && rawCharges !== '2') {
      throw new Error('OVERRIDE_REASONING_CHARGES must be 1 or 2.');
    }
    inspect = Number(rawCharges);
  }
  return { budget, costs: { ...COSTS }, charges: { inspect, continue: 3 } };
}

export function createWallet(rules) {
  const charges = {};
  for (const [tool, max] of Object.entries(rules.charges)) charges[tool] = { max, used: 0 };
  return { budget: rules.budget, spent: 0, costs: { ...rules.costs }, charges };
}

function assertKnown(wallet, tools) {
  for (const t of tools) {
    if (!Object.hasOwn(wallet.costs, t)) throw new Error(`Unknown tool: ${t}`);
  }
}

export function quote(wallet, tools, reserve) {
  assertKnown(wallet, tools);
  const cost = tools.reduce((sum, t) => sum + (wallet.costs[t] ?? 0), 0);
  for (const t of tools) {
    const c = wallet.charges[t];
    if (c && c.used >= c.max) return { cost, ok: false, reason: `No ${LABELS[t]} left.` };
  }
  if (wallet.budget == null) return { cost, ok: true, reason: null };
  const left = wallet.budget - wallet.spent;
  if (cost > left) {
    return { cost, ok: false, reason: `Not enough coins: this costs ${cost} and you have ${left} left.` };
  }
  if (left - cost < reserve) {
    return { cost, ok: false, reason: `Save coins: you need ${reserve} to ask everyone once.` };
  }
  return { cost, ok: true, reason: null };
}

export function spend(wallet, tools) {
  assertKnown(wallet, tools);
  const cost = tools.reduce((sum, t) => sum + (wallet.costs[t] ?? 0), 0);
  for (const t of tools) if (wallet.charges[t]) wallet.charges[t].used += 1;
  wallet.spent += cost;
  return { tools: [...tools], cost, total: wallet.spent };
}
