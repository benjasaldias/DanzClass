# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: availability.spec.ts >> Availability — /agenda page >> clicking an enabled (non-sleep) cell toggles the busy state
- Location: tests/e2e/availability.spec.ts:68:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 12000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e5]:
        - img "DanzClass" [ref=e7]:
          - generic [ref=e13]: dc
        - generic [ref=e14]: DanzClass
      - generic [ref=e15]:
        - heading "Bienvenido de vuelta" [level=1] [ref=e16]
        - paragraph [ref=e17]: Ingresa a tu cuenta
        - generic [ref=e18]: Email o contraseña incorrectos
        - generic [ref=e19]:
          - generic [ref=e20]:
            - generic [ref=e21]: Email
            - textbox "tu@email.com" [ref=e22]: benjamingsaldiash@gmail.com
          - generic [ref=e23]:
            - generic [ref=e24]: Contraseña
            - generic [ref=e25]:
              - textbox "••••••••" [ref=e26]: Benja2824.
              - button [ref=e27] [cursor=pointer]:
                - img [ref=e28]
          - button "Iniciar sesión" [ref=e31] [cursor=pointer]
        - paragraph [ref=e32]:
          - text: ¿No tienes cuenta?
          - link "Regístrate" [ref=e33] [cursor=pointer]:
            - /url: /auth/register
  - alert [ref=e34]
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
     |              ^ TimeoutError: page.waitForURL: Timeout 12000ms exceeded.
  29 | }
  30 | 
```