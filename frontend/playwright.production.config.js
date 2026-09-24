import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/legacy-urls.pw.js',
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5180', headless: true },
  webServer: {
    command: 'node scripts/serve-static.mjs --port 5180',
    url: 'http://127.0.0.1:5180/static/feedback-admin.html',
    timeout: 10_000,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
