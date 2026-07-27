import { expect, test, type Page } from '@playwright/test'

/**
 * End-to-end proof that a whole build can be specified without hitting a dead
 * end, that compatibility surfaces at the right moment, and that a shared link
 * round-trips. Runs with scraping disabled so it is deterministic and works
 * offline — prices fall back to catalog reference values.
 */

const BUILD: [string, string][] = [
  ['a CPU', 'Ryzen 7 9800X3D'],
  ['a CPU cooler', 'Liquid Freezer III 360'],
  ['a motherboard', 'MAG B850 TOMAHAWK MAX WIFI'],
  ['a memory kit', 'Trident Z5 Neo RGB 32GB'],
  ['a drive', '990 PRO 2TB'],
  ['a video card', 'TUF Gaming GeForce RTX 5070 Ti OC'],
  ['a case', 'LANCOOL 216'],
  ['a power supply', 'RM850e'],
]

async function pick(page: Page, category: string, search: string) {
  // Anchored: an unanchored /Choose a CPU/ also matches "Choose a CPU cooler".
  const trigger = page.getByRole('button', {
    name: new RegExp(`^Choose ${category}( required)?$`, 'i'),
  })
  await expect(trigger).toHaveCount(1)
  await trigger.click()
  const box = page.getByPlaceholder(/^Search/)
  await box.waitFor()
  await box.fill(search)
  const row = page.locator('tbody tr').first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(box).toBeHidden()
}

function money(text: string | null): number {
  return Number.parseFloat((text ?? '').replace(/[^0-9.]/g, ''))
}

test('specs a complete build, prices it, and shares it', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => consoleErrors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Build a PC that actually fits/i })).toBeVisible()

  for (const [category, search] of BUILD) await pick(page, category, search)

  // Every category is filled, so the "incomplete" note is gone.
  await expect(page.getByText(/Build is not complete yet/i)).toBeHidden()

  // A real build of these parts is comfortably over $1000.
  const total = money(await page.getByTestId('build-total').textContent())
  expect(total).toBeGreaterThan(1000)

  // Power is estimated and within a sane band for this hardware.
  const watts = Number.parseInt(
    (await page.getByTestId('power-watts').textContent())?.replace(/[^0-9]/g, '') ?? '0',
    10,
  )
  expect(watts).toBeGreaterThan(400)
  expect(watts).toBeLessThan(800)

  // Errors and warnings are both zero. An informational note ("enable EXPO")
  // is expected here and does not count against the all-clear badge.
  await expect(page.getByText(/All clear/i)).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('blocks an incompatible CPU and explains why', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')
  await pick(page, 'a motherboard', 'MAG B850 TOMAHAWK MAX WIFI')

  // The picker hides parts that cannot work by default.
  await page.getByLabel('Swap Ryzen 7 9800X3D').first().click()
  await page.getByPlaceholder(/^Search/).fill('i9-14900K')
  await expect(page.getByText(/No matching CPU/i)).toBeVisible()

  // Turning the filter off reveals them, flagged with a reason.
  await page.getByRole('checkbox').first().uncheck()
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await expect(page.getByText(/Doesn't fit/i).first()).toBeVisible()

  await page.locator('tbody tr').first().click()
  await expect(page.getByText(/CPU and motherboard sockets do not match/i)).toBeVisible()
  // The issue card offers a jump-to-swap for each implicated part.
  await expect(page.getByTitle(/Swap MAG B850/i)).toBeVisible()
})

test('round-trips a build through the URL', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')
  await pick(page, 'a video card', 'TUF Gaming GeForce RTX 5070 Ti OC')

  const url = page.url()
  expect(url).toContain('b=')

  const before = await page.getByTestId('build-total').textContent()
  await page.goto(url)
  await expect(page.getByText('Ryzen 7 9800X3D').first()).toBeVisible()
  await expect(page.getByTestId('build-total')).toHaveText(before ?? '')
})
