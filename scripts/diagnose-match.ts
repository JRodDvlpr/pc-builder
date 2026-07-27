/**
 * Why did a part fail to match?
 *
 * Runs the real searches for a part and prints every candidate title with its
 * score, so a miss can be read as "the retailer calls it something else" rather
 * than guessed at. Diagnostic only — it never writes to the cache.
 *
 *   npx tsx scripts/diagnose-match.ts mon-gigabyte-m27q mon-msi-mag274qrf
 *   npx tsx scripts/diagnose-match.ts --category monitor --unmatched
 */
import { ALL_PARTS, getPart } from '../src/lib/catalog'
import { getOffers } from '../src/lib/db/queries'
import { MATCH_THRESHOLD, scoreListing, searchQueries } from '../src/lib/scrape/match'
import { PROVIDERS } from '../src/lib/scrape/cache'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function targets(): string[] {
  const explicit = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.match(/^\d+$/))
  const category = arg('category')
  if (explicit.length > 0 && !category) return explicit

  let parts = ALL_PARTS
  if (category) parts = parts.filter((p) => p.category === category)
  if (process.argv.includes('--unmatched')) {
    const offers = getOffers(parts.map((p) => p.id))
    parts = parts.filter((p) => (offers.get(p.id) ?? []).length === 0)
  }
  const limit = Number.parseInt(arg('max') ?? '20', 10)
  return parts.slice(0, limit).map((p) => p.id)
}

async function main() {
  for (const id of targets()) {
    const part = getPart(id)
    if (!part) {
      console.log(`\n${id}: not in the catalog`)
      continue
    }

    console.log(`\n=== ${part.id} — ${part.brand} ${part.model} (mpn ${part.mpn})`)
    for (const provider of PROVIDERS) {
      for (const query of searchQueries(part)) {
        let listings
        try {
          listings = await provider.search(query)
        } catch (err) {
          console.log(`  ${provider.id} "${query}" → error: ${err instanceof Error ? err.message : err}`)
          continue
        }
        const scored = listings
          .map((l) => ({ l, score: scoreListing(part, l) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)

        console.log(`  ${provider.id} "${query}" → ${listings.length} listings`)
        for (const { l, score } of scored) {
          const flag = score >= MATCH_THRESHOLD ? 'HIT ' : '    '
          console.log(`    ${flag}${score.toFixed(2)}  $${l.price}  ${l.title.slice(0, 110)}`)
        }
        if (scored.some((s) => s.score >= MATCH_THRESHOLD)) break
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
