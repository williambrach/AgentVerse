import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fresh data per run, computed once (workers re-load this file, so the folder is inherited through the environment).
// Leftover teams and sessions from an earlier run can then never leak into the replay or leaderboard tests.
const runDir = process.env.OVERRIDE_E2E_DATA ??= mkdtempSync(join(tmpdir(), 'override-e2e-'));
const dataDir = name => join(runDir, name);
// Every context, including browser.newContext() in a spec, starts as a returning player who has seen the sponsor intro.
// splash.spec.mjs clears this to play it.
const seenSplash = { cookies: [], origins: [4317, 4318, 4319, 4320, 4321, 4322, 4323, 4324].map(port => ({ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: 'override.splash', value: 'seen' }] })) };

export default defineConfig({
  testDir: './tests/browser',
  // Keep the snapshot names from before the projects existed (no project name in the file name).
  // {snapshotDir} is already the test folder; adding the absolute {testDir} nests the path under tests/browser/Users/….
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-snapshotSuffix}{ext}',
  // A missing baseline fails instead of being written, so a test can never pass against its own fresh screenshot.
  updateSnapshots: 'none',
  projects: [
    { name: 'default', testIgnore: ['tower.spec.mjs', 'admin.spec.mjs', 'maker.spec.mjs', 'admin-upgrade.spec.mjs', 'coins.spec.mjs', 'factory.spec.mjs'] },
    { name: 'tower', testMatch: 'tower.spec.mjs', use: { baseURL: 'http://127.0.0.1:4318' } },
    { name: 'admin', testMatch: ['admin.spec.mjs', 'maker.spec.mjs', 'admin-upgrade.spec.mjs'], grepInvert: /@live/, use: { baseURL: 'http://127.0.0.1:4320' } },
    // Live mode over a mock LLM. Only the live tests in admin-upgrade.spec.mjs run here.
    { name: 'admin-live', testMatch: 'admin-upgrade.spec.mjs', grep: /@live/, use: { baseURL: 'http://127.0.0.1:4323' } },
    { name: 'factory', testMatch: 'factory.spec.mjs', use: { baseURL: 'http://127.0.0.1:4324' } },
    { name: 'coins', testMatch: 'coins.spec.mjs', use: { baseURL: 'http://127.0.0.1:4321' } },
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 75_000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
    viewport: { width: 1440, height: 1000 },
    storageState: seenSplash,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node server/index.mjs',
      url: 'http://127.0.0.1:4317/api/access',
      reuseExistingServer: false,
      env: { PORT: '4317', HOST: '127.0.0.1', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DATA_DIR: dataDir('sessions') },
    },
    {
      // Dev tools on, as in local development. Only the tower project talks to this server.
      command: 'node server/index.mjs',
      url: 'http://127.0.0.1:4318/api/access',
      reuseExistingServer: false,
      env: { PORT: '4318', HOST: '127.0.0.1', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DEV_TOOLS: '1', OVERRIDE_DATA_DIR: dataDir('sessions-tower') },
    },
    {
      // The real server with the admin listener on. Only the admin project talks to it; players are driven over the game port.
      command: 'node server/index.mjs',
      url: 'http://127.0.0.1:4320/admin',
      reuseExistingServer: false,
      env: { PORT: '4319', HOST: '127.0.0.1', OVERRIDE_ADMIN_TOKEN: 'admin-e2e', OVERRIDE_ADMIN_PORT: '4320', OVERRIDE_MAKER_TOKENS: 'maker:maker-e2e', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DATA_DIR: dataDir('sessions-admin') },
    },
    {
      // Demo driver: live mode over mock LLM endpoints, no simulated players. Only the admin-live project talks to it.
      command: 'node scripts/admin-demo.mjs --players 0 --port 4322 --admin-port 4323',
      url: 'http://127.0.0.1:4323/admin',
      reuseExistingServer: false,
      env: { OVERRIDE_ADMIN_TOKEN: 'admin-e2e' },
    },
    {
      // Rehearsal with a 15-coin budget. Only the coins project talks to this server.
      command: 'node server/index.mjs',
      url: 'http://127.0.0.1:4321/api/access',
      reuseExistingServer: false,
      env: { PORT: '4321', HOST: '127.0.0.1', OVERRIDE_COIN_BUDGET: '15', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DATA_DIR: dataDir('sessions-coins') },
    },
    {
      // Deadline case: dev tools on and a 45 s clock. Only the factory project talks to this server.
      command: 'node server/index.mjs',
      url: 'http://127.0.0.1:4324/api/access',
      reuseExistingServer: false,
      env: { PORT: '4324', HOST: '127.0.0.1', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DEV_TOOLS: '1', OVERRIDE_DEADLINE_SECONDS: '45', OVERRIDE_DATA_DIR: dataDir('sessions-factory') },
    },
  ],
});
