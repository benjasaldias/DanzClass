import { Page } from '@playwright/test'

/**
 * Logs in against whatever baseURL Playwright is configured with.
 * Reads credentials from env vars set before running the suite.
 *
 * SAFE: only reads cookies/session — does not write any application data.
 */
export async function loginAs(page: Page) {
  const email = process.env.E2E_USER_EMAIL
  const password = process.env.E2E_USER_PASSWORD

  if (!email || !password) {
    throw new Error(
      'E2E_USER_EMAIL and E2E_USER_PASSWORD must be set.\n' +
        'See tests/e2e-production/.env.example for the expected format.',
    )
  }

  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  // Accept any of the possible post-login landing routes
  await page.waitForURL(/\/(feed|explore|my-classes|agenda|profile)/, {
    timeout: 20_000,
  })
}
