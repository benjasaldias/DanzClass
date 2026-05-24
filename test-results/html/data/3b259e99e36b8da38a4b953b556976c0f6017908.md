# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: availability.spec.ts >> Availability — /agenda page >> section has exactly 2 sleep-config selects with valid hour values
- Location: tests/e2e/availability.spec.ts:40:7

# Error details

```
Error: page.waitForURL: Test ended.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Test source

```ts
  1  | import { Page } from '@playwright/test'
  2  | 
  3  | const EMAIL = process.env.E2E_USER_EMAIL ?? ''
  4  | const PASSWORD = process.env.E2E_USER_PASSWORD ?? ''
  5  | 
  6  | /**
  7  |  * Logs in with the given credentials and waits until the feed is loaded.
  8  |  * Uses E2E_USER_EMAIL / E2E_USER_PASSWORD env vars by default.
  9  |  *
  10 |  * Required data for the default test user:
  11 |  *   - At least one class they TEACH (for class-navigation tests)
  12 |  *   - At least one class they are ENROLLED in
  13 |  *   - A basic or pro subscription (to access /publish and /agenda)
  14 |  */
  15 | export async function loginAs(page: Page, email = EMAIL, password = PASSWORD) {
  16 |   if (!email || !password) {
  17 |     throw new Error(
  18 |       'E2E credentials missing. Set E2E_USER_EMAIL and E2E_USER_PASSWORD ' +
  19 |         'as environment variables before running the tests.\n' +
  20 |         'See tests/e2e/.env.example for the expected format.',
  21 |     )
  22 |   }
  23 | 
  24 |   await page.goto('/auth/login')
  25 |   await page.locator('input[type="email"]').fill(email)
  26 |   await page.locator('input[type="password"]').fill(password)
  27 |   await page.getByRole('button', { name: 'Iniciar sesión' }).click()
> 28 |   await page.waitForURL(/\/(feed|agenda|my-classes|explore)/, { timeout: 12_000 })
     |              ^ Error: page.waitForURL: Test ended.
  29 | }
  30 | 
```