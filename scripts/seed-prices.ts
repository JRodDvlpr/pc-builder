/**
 * Scrape live prices for a sample of the catalog and report the match rate.
 *
 * This is the canary for the whole price layer: if Newegg or Amazon change
 * their markup, the selectors stop matching and the rate collapses. Run it
 * after any change to a provider adapter or the matcher.
 *
 *   npm run seed:prices              -- 20 parts, mixed categories
 *   npm run seed:prices -- --all     -- the entire catalog (slow, be polite)
 *   npm run seed:prices -- --n 50 --category gpu
 */
import { ALL_PARTS, CATALOG } from '../src/lib/catalog'
import type { Category, Part } from '../src/lib/catalog/types'
import { CATEGORIES } from '../src/lib/catalog/types'
import { scrapeStats } from '../src/lib/db/queries'
import { PROVIDERS, readPrices, refreshPart } from '../src/lib/scrape/cache'
import { hostHealth } from '../src/lib/scrape/http'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function sample(): Part[] {
  if (process.argv.includes('--all')) return ALL_PARTS
  const category = arg('category') as Category | undefined
  const n = Number.parseInt(arg('n') ?? '20', 10)

  if (category) {
    if (!CATEGORIES.includes(category)) {
      console.error(`Unknown category "${category}". Expected one of: ${CATEGORIES.join(', ')}`)
      process.exit(1)
    }
    return (CATALOG[category] as Part[]).slice(0, n)
  }

  // Spread the sample across categories so one bad adapter cannot hide behind
  // another's success.
  const perCategory = Math.max(1, Math.ceil(n / CATEGORIES.length))
  return CATEGORIES.flatMap((c) => (CATALOG[c] as Part[]).slice(0, perCategory)).slice(0, n)
}

async function main() {
  const parts = sample()
  console.log(`Scraping ${parts.length} parts across ${PROVIDERS.map((p) => p.id).join(' + ')}\n`)

  let matched = 0
  const misses: Part[] = []
  const started = Date.now()

  for (const [i, part] of parts.entries()) {
    const label = `${part.brand} ${part.model}`.slice(0, 52).padEnd(52)
    process.stdout.write(`[${String(i + 1).padStart(3)}/${parts.length}] ${label} `)
    try {
      const hits = await refreshPart(part)
      if (hits > 0) {
        matched += 1
        const info = readPrices([part.id])[part.id]
        const delta = ((info.price - part.seedPrice) / part.seedPrice) * 100
        console.log(
          `$${info.price.toFixed(2).padStart(8)}  ${hits} src  ` +
            `(seed $${part.seedPrice}, ${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%)`,
        )
      } else {
        misses.push(part)
        console.log('no match')
      }
    } catch (err) {
      misses.push(part)
      console.log(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const rate = (matched / parts.length) * 100
  const elapsed = ((Date.now() - started) / 1000).toFixed(0)

  console.log(`\n${'─'.repeat(72)}`)
  console.log(`Matched ${matched}/${parts.length} (${rate.toFixed(0)}%) in ${elapsed}s`)

  if (misses.length > 0) {
    console.log(`\nUnmatched — check these by hand before assuming the adapters are fine:`)
    for (const p of misses) console.log(`  · ${p.brand} ${p.model}  [${p.mpn}]`)
  }

  const health = hostHealth()
  if (health.some((h) => h.failures > 0 || h.inCooldown)) {
    console.log('\nHost health:')
    for (const h of health) {
      console.log(`  ${h.host}: ${h.failures} consecutive failures${h.inCooldown ? ' (in cooldown)' : ''}`)
    }
  }

  const stats = scrapeStats()
  console.log(
    `\nCache now holds ${stats.offers} offers across ${stats.parts} parts ` +
      `(${stats.matched}/${stats.attempted} attempts matched).`,
  )

  // A collapse in match rate almost always means the markup moved.
  if (rate < 50) {
    console.error('\nMatch rate below 50% — the provider selectors likely need updating.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
