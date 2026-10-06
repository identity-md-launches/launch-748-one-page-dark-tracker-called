import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: process.env.LIVE_RPC ? [] : ['live.spec.ts'],
  timeout: 35_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  outputDir: 'test/scratch/playwright-results',
  use: { baseURL: 'http://127.0.0.1:4173/preview/', browserName: 'chromium', viewport: { width: 1440, height: 1100 } },
  webServer: { command: 'node tests/serve.mjs', url: 'http://127.0.0.1:4173/preview/', reuseExistingServer: false },
});
