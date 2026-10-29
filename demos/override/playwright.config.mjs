import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  // Keep the snapshot names from before the projects existed (no project name in the file name).
  // {snapshotDir} is already the test folder; adding the absolute {testDir} nests the path under tests/browser/Users/….
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-snapshotSuffix}{ext}',
  // A missing baseline fails instead of being written, so a test can never pass against its own fresh screenshot.
  updateSnapshots: 'none',
  projects: [
    { name: 'default', testIgnore: 'tower.spec.mjs' },
    { name: 'tower', testMatch: 'tower.spec.mjs', use: { baseURL: 'http://127.0.0.1:4318' } },
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 75_000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
    viewport: { width: 1440, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node server/index.mjs',
      url: 'http://127.0.0.1:4317/api/access',
      reuseExistingServer: false,
      env: { PORT: '4317', HOST: '127.0.0.1', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DATA_DIR: './test-results/sessions' },
    },
    {
      // Dev tools on, as in local development. Only the tower project talks to this server.
      command: 'node server/index.mjs',
      url: 'http://127.0.0.1:4318/api/access',
      reuseExistingServer: false,
      env: { PORT: '4318', HOST: '127.0.0.1', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DEV_TOOLS: '1', OVERRIDE_DATA_DIR: './test-results/sessions-tower' },
    },
  ],
});
