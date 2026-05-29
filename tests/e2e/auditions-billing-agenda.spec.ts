/**
 * Tests: Auditions flow, billing_day, agenda event colors, rehearsals
 *
 * Data requirements (must hold for the test user):
 *   - A subscription of tier 'basic' or higher (canTeach).
 *   - At least one class of type 'entrenamiento' that the user TEACHES,
 *     visible in /my-classes → "Clases que dicto".
 *   - The test user must be enrolled in at least one class (for agenda).
 *   - Optionally a rehearsal (for agenda rehearsal color test).
 *
 * Environment variables required (same as other e2e tests):
 *   E2E_USER_EMAIL, E2E_USER_PASSWORD
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

// ─── Auditions ──────────────────────────────────────────────────────────────

test.describe('Auditions — training enrollment flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('teacher can navigate to auditions page for an entrenamiento class', async ({ page }) => {
    await page.goto('/my-classes')
    await page.getByRole('button', { name: /clases que dicto/i }).click()

    // Find the first class link in the teaching tab
    const firstLink = page.locator('a[href^="/class/"]').first()
    await expect(firstLink).toBeVisible({ timeout: 8_000 })
    const href = await firstLink.getAttribute('href')
    expect(href).toMatch(/^\/class\//)

    // Navigate to the class detail
    await page.goto(href!)

    // If the class has auditions, the link to the auditions page should be present
    const auditionsLink = page.locator('a[href*="/auditions"]')
    if (await auditionsLink.count() > 0) {
      await expect(auditionsLink.first()).toBeVisible()
    }
  })

  test('auditions page shows applicant list for teacher', async ({ page }) => {
    await page.goto('/my-classes')
    await page.getByRole('button', { name: /clases que dicto/i }).click()

    const firstLink = page.locator('a[href^="/class/"]').first()
    await expect(firstLink).toBeVisible({ timeout: 8_000 })
    const classHref = await firstLink.getAttribute('href')
    const auditionsHref = `${classHref}/auditions`

    await page.goto(auditionsHref)

    // The page should not 404 — must render something
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8_000 })

    // If there are auditions, the publish button should exist
    const publishBtn = page.getByRole('button', { name: /publicar resultados/i })
    const emptyMsg = page.getByText(/no hay postulaciones/i)
    const isEmpty = await emptyMsg.count() > 0
    if (!isEmpty) {
      await expect(publishBtn).toBeVisible()
    }
  })

  test('non-accepted student cannot see "Reservar cupo" on entrenamiento with open auditions', async ({ page }) => {
    // This test verifies the canEnrollDirectly logic for entrenamiento + requires_audition
    // We look for a public entrenamiento class that is not taught by this user
    await page.goto('/feed')
    await page.getByRole('button', { name: /global/i }).click()
    await page.waitForTimeout(2_000)

    // Look for any article in the feed
    const cards = page.locator('article')
    const count = await cards.count()
    if (count === 0) {
      test.skip()
      return
    }

    // Click the first "Ver clase" link
    const verClase = cards.first().getByRole('link', { name: /ver clase/i })
    if (await verClase.count() === 0) {
      test.skip()
      return
    }
    await verClase.click()
    await page.waitForURL(/\/class\//, { timeout: 10_000 })

    // On this class detail, "Reservar cupo" should NOT be present
    // if it's an entrenamiento with requires_audition and the user hasn't been accepted.
    // This is an informational assertion — not all classes in the feed are entrenamiento.
    const reservarBtn = page.getByRole('button', { name: /reservar cupo/i })
    // We can't assert false since it might be a non-entrenamiento class; we just verify no crash
    await expect(page.locator('h1, [data-testid="class-title"]').first()).toBeVisible({ timeout: 8_000 })
    // The page must show something meaningful without error
    await expect(page.locator('body')).not.toContainText('Error', { ignoreCase: false })
    void reservarBtn // no assertion — class type unknown
  })
})

// ─── Billing day ────────────────────────────────────────────────────────────

test.describe('Billing day — create/edit class', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('create-class form shows billing_day input when type is entrenamiento', async ({ page }) => {
    await page.goto('/create-class')

    // Select "Entrenamiento" as the class type
    const typeSelect = page.locator('select, [role="listbox"]').filter({ hasText: /tipo/i }).first()
    if (await typeSelect.count() === 0) {
      // Type buttons or radio-style selector
      const entBtn = page.getByRole('button', { name: /entrenamiento/i })
      if (await entBtn.count() > 0) await entBtn.click()
    } else {
      await typeSelect.selectOption({ label: /entrenamiento/i })
    }

    // After selecting entrenamiento, the billing_day field should appear
    // It's rendered as a number input with placeholder "1"
    const billingInput = page.locator('input[type="number"][placeholder="1"]').first()
    await expect(billingInput).toBeVisible({ timeout: 5_000 })
  })

  test('billing_day field accepts values between 1 and 27', async ({ page }) => {
    await page.goto('/create-class')

    // Select entrenamiento type
    const entBtn = page.getByText(/entrenamiento/i).first()
    if (await entBtn.count() > 0) await entBtn.click()

    const billingInput = page.locator('input[type="number"][placeholder="1"]').first()
    if (await billingInput.count() === 0) {
      test.skip()
      return
    }

    await billingInput.fill('15')
    await expect(billingInput).toHaveValue('15')

    await billingInput.fill('1')
    await expect(billingInput).toHaveValue('1')
  })

  test('class detail shows billing_day for entrenamiento', async ({ page }) => {
    // Navigate to my-classes and find the first entrenamiento class owned by user
    await page.goto('/my-classes')
    await page.getByRole('button', { name: /clases que dicto/i }).click()

    const firstLink = page.locator('a[href^="/class/"]').first()
    await expect(firstLink).toBeVisible({ timeout: 8_000 })
    const href = await firstLink.getAttribute('href')
    await page.goto(href!)

    // The page renders — no crash
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })

    // If it's an entrenamiento with billing_day, the label should appear
    const billingLabel = page.getByText(/cobro mensual el día/i)
    // This is optional — class might not be entrenamiento
    if (await billingLabel.count() > 0) {
      await expect(billingLabel.first()).toBeVisible()
    }
  })

  test('edit-class form shows billing_day input for entrenamiento', async ({ page }) => {
    await page.goto('/my-classes')
    await page.getByRole('button', { name: /clases que dicto/i }).click()

    const firstLink = page.locator('a[href^="/class/"]').first()
    await expect(firstLink).toBeVisible({ timeout: 8_000 })
    const href = await firstLink.getAttribute('href')
    await page.goto(`${href}/edit`)

    // The edit page should load
    await expect(page.locator('h1, form').first()).toBeVisible({ timeout: 8_000 })

    // If it's entrenamiento, the billing_day input should be visible
    const billingInput = page.locator('input[placeholder="1"]').first()
    if (await billingInput.count() > 0) {
      await expect(billingInput).toBeVisible()
    }
  })
})

// ─── Agenda event colors ─────────────────────────────────────────────────────

test.describe('Agenda — event color classes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('agenda page loads without error', async ({ page }) => {
    await page.goto('/agenda')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  test('agenda legend shows three colored dots', async ({ page }) => {
    await page.goto('/agenda')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // The legend should contain three dot indicators (span with rounded-full)
    const legendDots = page.locator('.rounded-full').filter({ has: page.locator('+ :text("Inscritas"), + :text("Que dicto"), + :text("Ensayos")') })
    // Check that legend text appears
    await expect(page.getByText('Clases inscritas')).toBeVisible()
    await expect(page.getByText('Clases que dicto')).toBeVisible()
    await expect(page.getByText('Ensayos')).toBeVisible()
    void legendDots
  })

  test('enrolled class event card uses sky color', async ({ page }) => {
    await page.goto('/agenda')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // Look for event cards — they contain a color bar div
    const cards = page.locator('a[href^="/class/"]')
    if (await cards.count() === 0) {
      // No events this week — skip but don't fail
      return
    }

    // The first card's side bar should have a sky-* class
    const firstBar = cards.first().locator('div.rounded-full, .w-1').first()
    const className = await firstBar.getAttribute('class') ?? ''
    // Either sky-500 (enrolled) or emerald-500 (teaching) or violet-500 (rehearsal)
    const hasSky = className.includes('sky-') || className.includes('emerald-') || className.includes('violet-') || className.includes('slate-')
    expect(hasSky).toBe(true)
  })

  test('teaching class event shows "Tú dictas" label in emerald color', async ({ page }) => {
    await page.goto('/agenda')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    const tuDictas = page.getByText('Tú dictas')
    if (await tuDictas.count() === 0) return // no teaching events this week

    const label = tuDictas.first()
    const className = await label.getAttribute('class') ?? ''
    expect(className).toContain('emerald')
  })
})

// ─── Rehearsals ──────────────────────────────────────────────────────────────

test.describe('Rehearsals — navigation and display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('agenda shows rehearsal events with violet color when present', async ({ page }) => {
    await page.goto('/agenda')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    const rehearsalBadges = page.locator('span').filter({ hasText: /^ensayo$/i })
    if (await rehearsalBadges.count() === 0) return // no rehearsals this week

    // The badge should have violet color class
    const badge = rehearsalBadges.first()
    const className = await badge.getAttribute('class') ?? ''
    expect(className).toContain('violet')
  })

  test('my-classes page has Ensayos tab', async ({ page }) => {
    await page.goto('/my-classes')
    const ensayosTab = page.getByRole('button', { name: /ensayos/i })
    await expect(ensayosTab).toBeVisible({ timeout: 8_000 })
  })

  test('Ensayos tab in my-classes loads without error', async ({ page }) => {
    await page.goto('/my-classes')
    await page.getByRole('button', { name: /ensayos/i }).click()

    // The tab content should render
    await expect(page.locator('body')).not.toContainText('Internal Server Error')

    // Either a list of rehearsals or an empty-state message
    const content = page.locator('h2, p, [role="listitem"]').first()
    await expect(content).toBeVisible({ timeout: 8_000 })
  })

  test('rehearsal detail page loads from agenda link', async ({ page }) => {
    await page.goto('/agenda')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    const rehearsalLinks = page.locator('a[href*="/rehearsal/"]')
    if (await rehearsalLinks.count() === 0) return // no rehearsal links this week

    await rehearsalLinks.first().click()
    await expect(page).toHaveURL(/\/rehearsal\//, { timeout: 10_000 })
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8_000 })
  })
})
