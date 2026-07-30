import { expect, test, type Page } from '@playwright/test'

/**
 * Marking a part as already owned, and overriding a price by hand.
 *
 * The thing being proven is arithmetic the user can see: the headline total is
 * what is left to buy, and it drops by exactly the price of whatever they said
 * they already have.
 */

async function pick(page: Page, category: string, search: string) {
  const trigger = page.getByRole('button', {
    name: new RegExp(`^Choose ${category}( required)?$`, 'i'),
  })
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

const total = (page: Page) => page.getByTestId('build-total')

test('excludes a part the user already owns from the total', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')
  await pick(page, 'a drive', '990 PRO 2TB')

  const withBoth = money(await total(page).textContent())
  expect(withBoth).toBeGreaterThan(0)

  // Read the drive's own price before removing it from the reckoning.
  const driveRow = page.locator('tr', { hasText: '990 PRO 2TB' })
  const drivePrice = money(await driveRow.locator('.tnum').first().textContent())

  await page.getByRole('button', { name: /^Mark .*990 PRO 2TB.* as already owned$/i }).click()

  await expect(driveRow.getByText('Owned · not in total')).toBeVisible()
  await expect(page.getByTestId('owned-total')).toContainText('1 part')

  const remaining = money(await total(page).textContent())
  expect(remaining).toBeCloseTo(withBoth - drivePrice, 1)
})

test('puts an owned part back into the total', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')

  const before = money(await total(page).textContent())
  await page.getByRole('button', { name: /as already owned$/i }).click()
  expect(money(await total(page).textContent())).toBe(0)

  await page.getByRole('button', { name: /^Include .* in the total$/i }).click()
  await expect(page.getByTestId('owned-total')).toBeHidden()
  expect(money(await total(page).textContent())).toBeCloseTo(before, 1)
})

test('uses a price the user types instead of the market one', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')

  await page.getByRole('button', { name: /^Set a custom price for /i }).click()
  const field = page.getByRole('textbox', { name: 'Custom price' })
  await field.fill('123.45')
  await field.press('Enter')

  await expect(total(page)).toHaveText('$123.45')

  // And the override survives being shared.
  await page.reload()
  await expect(total(page)).toHaveText('$123.45')
})

test('restores the market price when the override is cleared', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')
  const market = money(await total(page).textContent())

  await page.getByRole('button', { name: /^Set a custom price for /i }).click()
  const field = page.getByRole('textbox', { name: 'Custom price' })
  await field.fill('1')
  await field.press('Enter')
  expect(money(await total(page).textContent())).toBe(1)

  await page.getByRole('button', { name: /^Use the market price for /i }).click()
  expect(money(await total(page).textContent())).toBeCloseTo(market, 1)
})

test('abandons an edit on Escape', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')
  const market = money(await total(page).textContent())

  await page.getByRole('button', { name: /^Set a custom price for /i }).click()
  const field = page.getByRole('textbox', { name: 'Custom price' })
  await field.fill('9')
  await field.press('Escape')

  expect(money(await total(page).textContent())).toBeCloseTo(market, 1)
})

test('carries owned parts and custom prices through a shared link', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'a CPU', 'Ryzen 7 9800X3D')
  await pick(page, 'a drive', '990 PRO 2TB')

  await page.getByRole('button', { name: /as already owned$/i }).first().click()
  await page.getByRole('button', { name: /^Set a custom price for /i }).last().click()
  const field = page.getByRole('textbox', { name: 'Custom price' })
  await field.fill('200')
  await field.press('Enter')

  const shared = page.url()
  expect(shared).toContain('b=')

  await page.goto('about:blank')
  await page.goto(shared)

  await expect(page.getByTestId('owned-total')).toBeVisible()
  await expect(total(page)).toHaveText('$200.00')
})
