/**
 * Playwright config for pure unit tests (no browser required).
 *
 * These tests import shared utility functions directly and run without launching
 * any browser. They execute as fast as Jest/Vitest tests.
 *
 * Run with: npm run test:unit
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/unit',
  outputDir: 'test-results/unit-artifacts',
  projects: [{ name: 'unit' }],
  reporter: 'list',
})
