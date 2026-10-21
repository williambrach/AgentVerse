import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
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
  webServer: {
    command: 'node server/index.mjs',
    url: 'http://127.0.0.1:4317/api/access',
    reuseExistingServer: false,
    env: { PORT: '4317', HOST: '127.0.0.1', OVERRIDE_LLM_API_KEY: '', OVERRIDE_LLM_MODEL: '', OVERRIDE_ACCESS_CODE: '', OVERRIDE_DATA_DIR: './test-results/sessions' },
  },
});
