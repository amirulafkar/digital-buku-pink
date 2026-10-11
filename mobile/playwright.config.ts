import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Dev credentials come from the git-ignored db/.env (never committed).
try {
  for (const line of readFileSync('../db/.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* db/.env missing: tests that need it fail loudly */ }

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4300', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    // Flows run once, on the larger phone. Layout and accessibility specs run on both phone sizes.
    { name: 'phone-375', use: { browserName: 'chromium', viewport: { width: 375, height: 812 } } },
    { name: 'phone-360', testMatch: /(a11y|layout)\.spec\.ts/, use: { browserName: 'chromium', viewport: { width: 360, height: 640 } } },
  ],
  webServer: [
    { command: 'sh ../db/dev-api.sh', url: 'http://127.0.0.1:5080/health', reuseExistingServer: true, timeout: 180_000 },
    { command: 'npm start', url: 'http://127.0.0.1:4300', reuseExistingServer: true, timeout: 180_000 },
  ],
});
