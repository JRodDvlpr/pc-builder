/**
 * Refresh every cached price that has gone stale.
 *
 * Intended for a cron job or a manual top-up; the app refreshes lazily on its
 * own as parts are viewed, so this only exists to warm the cache ahead of time.
 *
 *   npm run refresh:prices
 *   npm run refresh:prices -- --max 100
 */
import { ALL_PARTS, getPart } from '../src/lib/catalog'
import { scrapeStats } from '../src/lib/db/queries'
import { needsRefresh, refreshPart } from '../src/lib/scrape/cache'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const max = Number.parseInt(arg('max') ?? '150', 10)
  const stale = needsRefresh(ALL_PARTS.map((p) => p.id)).slice(0, max)

  if (stale.length === 0) {
    console.log('Everything in the cache is still fresh — nothing to do.')
    return
  }

  console.log(`Refreshing ${stale.length} stale parts (of ${ALL_PARTS.length} in the catalog)\n`)
  let matched = 0

  for (const [i, partId] of stale.entries()) {
    const part = getPart(partId)
    if (!part) continue
    const label = `${part.brand} ${part.model}`.slice(0, 54).padEnd(54)
    process.stdout.write(`[${String(i + 1).padStart(3)}/${stale.length}] ${label} `)
    try {
      const hits = await refreshPart(part)
      matched += hits > 0 ? 1 : 0
      console.log(hits > 0 ? `${hits} source${hits === 1 ? '' : 's'}` : 'no match')
    } catch (err) {
      console.log(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const stats = scrapeStats()
  console.log(
    `\nRefreshed ${matched}/${stale.length}. Cache holds ${stats.offers} offers across ${stats.parts} parts.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
