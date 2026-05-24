/**
 * Playwright PRODUCTION smoke-test configuration.
 * Target: https://dc-project-web.vercel.app  (or E2E_BASE_URL)
 *
 * These tests are READ-ONLY — they never submit forms, delete content,
 * or toggle persistent state. Safe to run against the live site.
 *
 * Prerequisites:
 *   export E2E_USER_EMAIL=your@email.com
 *   export E2E_USER_PASSWORD=yourpassword
 *   # optional:
 *   export E2E_BASE_URL=https://dc-project-web.vercel.app
 *   export E2E_PUBLIC_CLASS_ID=<uuid-of-a-public-class>
 *   export E2E_EXPECT_OWN_CLASS=true
 *
 * Commands:
 *   npm run test:e2e:prod            — headless Chromium
 *   npm run test:e2e:prod:headed     — visible browser
 *   npm run test:e2e:prod:ui         — Playwright UI
 *
 * Local E2E (localhost) stays in playwright.config.ts — untouched.
 */

import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://dc-project-web.vercel.app'

export default defineConfig({
  testDir: './tests/e2e-production',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Extra retries: production has real network latency
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  outputDir: 'test-results/prod-artifacts',
  reporter: [
    ['html', { outputFolder: 'playwright-report-prod', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    // Higher timeouts for remote network
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
