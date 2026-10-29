import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/** Checks `target` (page, context or API request context) into a fresh team. Returns the team name. */
export async function joinTeam(target, name = `Team ${randomUUID().slice(0, 8)}`) {
  const request = target.request ?? target;
  const res = await request.post('/api/team', { data: { name } });
  if (res.status() !== 200) throw new Error(`team check-in failed: ${res.status()} ${await res.text()}`);
  return name;
}

/** The base test, but `page` has already checked in, so specs that are not about check-in see the game. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await joinTeam(page);
    await use(page);
  },
});

export { expect };
