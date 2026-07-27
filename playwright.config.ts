import { defineConfig, devices } from '@playwright/test'

/**
 * Chromium is preinstalled in this environment; `executablePath` points at it so
 * `playwright install` is never needed. Override with PLAYWRIGHT_CHROMIUM_PATH
 * if your local install lives elsewhere, or delete the launchOptions to use
 * Playwright's own managed download.
 */
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: existsOrUndefined(executablePath),
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Serves an existing production build; `npm run test:e2e` builds first.
        // Dev-mode on-demand compilation adds multi-second stalls on first paint
        // of each route, which shows up as flaky waits. Scraping is disabled so
        // the suite is deterministic and works offline — prices fall back to
        // catalog reference values.
        command: 'PC_BUILDER_DISABLE_SCRAPE=1 npx next start -p 3210',
        url: 'http://127.0.0.1:3210',
        // Never reuse: a stale server left on this port answers the readiness
        // probe, Playwright skips starting a fresh one, and the whole suite then
        // runs against an old build. Failing loudly on a port clash is better.
        reuseExistingServer: false,
        timeout: 120_000,
      },
})

function existsOrUndefined(path: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:fs').existsSync(path) ? { executablePath: path } : undefined
  } catch {
    return undefined
  }
}
