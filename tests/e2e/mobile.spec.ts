import { devices, expect, test } from '@playwright/test'

/**
 * Phone-sized regressions. Every assertion here corresponds to a bug that was
 * live and invisible to the desktop suite: the build table overflowed the
 * viewport so prices and row actions sat off-screen, the filter drawer was
 * positioned against the viewport instead of the picker and covered the page
 * header, and the reason a part did not fit was locked inside a hover-only
 * tooltip that touch devices can never open.
 */
// Take the iPhone 12 viewport, DPR and touch flags, but not its
// `defaultBrowserType: 'webkit'` — this suite runs on the Chromium project, and
// spreading the descriptor wholesale makes Playwright try to launch WebKit.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone12 } = devices['iPhone 12']

test.use({ ...iPhone12, browserName: 'chromium' })

const FULL_BUILD =
  '/?b=cpu-9800x3d,cool-lf3-360,mb-b850-tomahawk,mem-tz5-6000c30-32,ssd-990pro-2tb,gpu-5070ti-tuf,case-lancool-216,psu-rm850e'

async function horizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test('no page ever scrolls sideways on a phone', async ({ page }) => {
  for (const url of ['/', FULL_BUILD]) {
    await page.goto(url)
    await expect(page.locator('table').first()).toBeVisible()
    expect(await horizontalOverflow(page), `overflow at ${url}`).toBeLessThanOrEqual(1)
  }

  // Multi-select categories add a quantity stepper, which is what originally
  // pushed the row past the edge.
  await page.goto(FULL_BUILD)
  await expect(page.getByLabel(/Increase quantity/).first()).toBeVisible()
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

test('price and row actions stay on screen in the build table', async ({ page }) => {
  await page.goto(FULL_BUILD)
  const vw = page.viewportSize()!.width

  for (const name of [/Swap Ryzen 7 9800X3D/, /Remove Ryzen 7 9800X3D/]) {
    const box = await page.getByLabel(name).first().boundingBox()
    expect(box, `${name} should be rendered`).not.toBeNull()
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
    // Comfortable tap target.
    expect(box!.height).toBeGreaterThanOrEqual(32)
  }

  // The price column must be fully within the viewport, not clipped.
  const price = page.getByText('$479.00').first()
  const priceBox = await price.boundingBox()
  expect(priceBox).not.toBeNull()
  expect(priceBox!.x + priceBox!.width).toBeLessThanOrEqual(vw)
})

test('the filter drawer opens inside the picker, not over the header', async ({ page }) => {
  await page.goto(FULL_BUILD)
  await page.getByLabel('Swap MAG B850 TOMAHAWK MAX WIFI').first().click()
  await page.getByRole('button', { name: /^Filters/ }).click()

  const drawer = page.locator('[role=dialog] aside')
  await expect(drawer).toBeVisible()

  const drawerBox = (await drawer.boundingBox())!
  const dialogBox = (await page.locator('[role=dialog]').boundingBox())!

  // Contained by the picker rather than escaping to the viewport.
  expect(drawerBox.y).toBeGreaterThanOrEqual(dialogBox.y - 1)
  expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1)
  // And not clipped off the left edge.
  expect(drawerBox.x).toBeGreaterThanOrEqual(0)
})

test('shows why a part does not fit without needing hover', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Choose a CPU( required)?$/i }).click()
  await page.getByPlaceholder(/^Search/).fill('Ryzen 7 9800X3D')
  await page.locator('tbody tr').first().click()

  await page.getByRole('button', { name: /^Choose a motherboard( required)?$/i }).click()
  await page.getByRole('checkbox').first().uncheck()
  await page.getByPlaceholder(/^Search/).fill('Z790 TOMAHAWK')

  // The reason is rendered inline on small screens, so it is readable on touch
  // rather than hidden behind a tooltip that :hover can never trigger.
  await expect(
    page.getByText(/sockets do not match|LGA1700/i).first(),
  ).toBeVisible()
})
