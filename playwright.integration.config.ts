/**
 * Playwright config para tests de INTEGRACIÓN contra el stack local de Supabase
 * (Docker). No levantan navegador: importan directo los módulos de servidor
 * (`apps/web/src/lib/*`) y escriben en la base local.
 *
 * Requiere `npm run db:start` corriendo y `apps/web/.env.development.local`.
 * NUNCA apuntar a producción: estos tests crean y borran usuarios/clases.
 *
 * Run with: npm run test:integration
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/integration',
  outputDir: 'test-results/integration-artifacts',
  projects: [{ name: 'integration' }],
  workers: 1,
  reporter: 'list',
})
