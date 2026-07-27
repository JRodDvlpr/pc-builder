import { expect, test, type Page } from '@playwright/test'

/**
 * Theme behaviour: dark is the default regardless of what the OS reports, an
 * explicit choice persists, and the theme is applied before first paint so the
 * page never flashes the wrong one.
 *
 * The default is intentionally not tied to `prefers-color-scheme`: Chromium
 * reports `light` both when the user prefers light and when no preference
 * exists, so keying off it would quietly send most visitors to light.
 */

const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'))

const bodyBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test.describe('defaults to dark for a first-time visitor', () => {
  for (const scheme of ['dark', 'light', 'no-preference'] as const) {
    test(`dark even when the OS reports "${scheme}"`, async ({ browser }) => {
      const page = await browser.newPage({ colorScheme: scheme })
      await page.goto('/')
      expect(await isDark(page)).toBe(true)
      await page.close()
    })
  }
})

test('the toggle flips the theme and survives a reload', async ({ browser }) => {
  const page = await browser.newPage({ colorScheme: 'dark' })
  await page.goto('/')
  expect(await isDark(page)).toBe(true)
  const darkBg = await bodyBg(page)

  await page.getByRole('button', { name: /switch to light theme/i }).click()
  expect(await isDark(page)).toBe(false)
  const lightBg = await bodyBg(page)
  expect(lightBg).not.toBe(darkBg)

  // An explicit choice outranks the OS preference on the next visit.
  await page.reload()
  expect(await isDark(page)).toBe(false)
  expect(await bodyBg(page)).toBe(lightBg)

  await page.getByRole('button', { name: /switch to dark theme/i }).click()
  expect(await isDark(page)).toBe(true)
  await page.reload()
  expect(await isDark(page)).toBe(true)
  await page.close()
})

test('applies the theme before first paint, with no flash', async ({ browser }) => {
  const page = await browser.newPage({ colorScheme: 'dark' })

  // Sample the class as early as the document exists — if the theme were applied
  // in a React effect rather than a blocking head script, this would be false
  // and the user would see a white flash on every load.
  await page.addInitScript(() => {
    const w = window as unknown as { __earlyDark?: boolean }
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive' && w.__earlyDark === undefined) {
        w.__earlyDark = document.documentElement.classList.contains('dark')
      }
    })
  })

  await page.goto('/')
  const early = await page.evaluate(() => (window as unknown as { __earlyDark?: boolean }).__earlyDark)
  expect(early).toBe(true)
  await page.close()
})

test('both themes render readable, distinct surfaces', async ({ browser }) => {
  const seen: Record<string, string> = {}

  for (const theme of ['dark', 'light'] as const) {
    const page = await browser.newPage()
    // Drive the theme the way a user does — via the stored choice, not the OS,
    // since the app deliberately ignores prefers-color-scheme.
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
    await page.goto('/?b=cpu-9800x3d,mb-b850-tomahawk,gpu-5070ti-tuf,psu-rm850e')

    // Text and background must not collapse into each other in either theme.
    const { bg, fg } = await page.evaluate(() => {
      const s = getComputedStyle(document.body)
      return { bg: s.backgroundColor, fg: s.color }
    })
    expect(bg).not.toBe(fg)

    // The card surface sits above the page background in both themes.
    const surface = await page
      .locator('table')
      .first()
      .evaluate((el) => getComputedStyle(el.closest('div')!).backgroundColor)
    expect(surface).not.toBe('rgba(0, 0, 0, 0)')

    // Native controls (scrollbars, checkboxes) follow the theme rather than
    // staying light-on-dark.
    const colorScheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    )
    expect(colorScheme).toBe(theme)

    seen[theme] = bg
    await page.close()
  }

  // The two themes are genuinely different, not one palette applied twice.
  expect(seen.dark).not.toBe(seen.light)
})
