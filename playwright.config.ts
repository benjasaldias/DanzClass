/**
 * Playwright E2E configuration for DanzClass web app.
 *
 * Prerequisites:
 *   1. Run `npm run dev:web` to start Next.js on http://localhost:3000
 *   2. Set env vars for the test user:
 *        export E2E_USER_EMAIL=your@email.com
 *        export E2E_USER_PASSWORD=yourpassword
 *      The test user needs: at least one class they teach, one enrollment,
 *      and a basic/pro subscription (to access /publish).
 *
 * Commands:
 *   npm run test:e2e            — headless Chromium
 *   npm run test:e2e:headed     — visible browser window
 *   npm run test:e2e:ui         — interactive Playwright UI
 *   npm run test:unit           — pure unit tests (no browser needed)
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: 'test-results/e2e-artifacts',
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
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
