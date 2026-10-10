import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Dev credentials come from the git-ignored db/.env (never committed).
try {
  for (const line of readFileSync('../db/.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* db/.env missing: tests that need it will fail loudly */ }

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      // API against the local Postgres container (run db/seed/reset.sh first for a clean database).
      command: 'sh ../db/dev-api.sh',
      url: 'http://127.0.0.1:5080/health',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    { command: 'npm start', url: 'http://127.0.0.1:4200', reuseExistingServer: true, timeout: 180_000 },
  ],
});
