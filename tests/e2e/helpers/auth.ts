import { Page } from '@playwright/test'

const EMAIL = process.env.E2E_USER_EMAIL ?? ''
const PASSWORD = process.env.E2E_USER_PASSWORD ?? ''

/**
 * Logs in with the given credentials and waits until the feed is loaded.
 * Uses E2E_USER_EMAIL / E2E_USER_PASSWORD env vars by default.
 *
 * Required data for the default test user:
 *   - At least one class they TEACH (for class-navigation tests)
 *   - At least one class they are ENROLLED in
 *   - A basic or pro subscription (to access /publish and /agenda)
 */
export async function loginAs(page: Page, email = EMAIL, password = PASSWORD) {
  if (!email || !password) {
    throw new Error(
      'E2E credentials missing. Set E2E_USER_EMAIL and E2E_USER_PASSWORD ' +
        'as environment variables before running the tests.\n' +
        'See tests/e2e/.env.example for the expected format.',
    )
  }

  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForURL(/\/(feed|agenda|my-classes|explore)/, { timeout: 12_000 })
}
