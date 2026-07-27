/**
 * Freeze the image URLs discovered by scraping into a committed file.
 *
 * A part only gets a thumbnail once it has been scraped, and the offer cache is
 * disposable — it lives in /tmp on Vercel and is wiped on every cold start. That
 * left most parts showing the category icon rather than a product shot. Writing
 * the URLs into the repo means every part has one from first paint, with live
 * scraping still free to supersede it.
 *
 * Only the URL is stored, not the image itself; the retailer CDN still serves
 * the bytes.
 *
 *   npm run seed:prices -- --all     # populate the cache first
 *   npm run export:images            # then freeze what it found
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ALL_PARTS } from '../src/lib/catalog'
import { getOffers } from '../src/lib/db/queries'

const OUT = join(process.cwd(), 'data', 'seed-images.json')

function main() {
  const ids = ALL_PARTS.map((p) => p.id)
  const offers = getOffers(ids)

  const images: Record<string, string> = {}
  for (const id of ids) {
    // Prefer whichever provider actually returned one; they are equivalent for
    // display purposes.
    const found = offers.get(id)?.find((o) => o.image)?.image
    if (found) images[id] = found
  }

  // Sorted so the diff is readable when parts are added later.
  const sorted = Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 0).replace(/","/g, '",\n  "')}\n`)

  const pct = ((Object.keys(sorted).length / ids.length) * 100).toFixed(0)
  console.log(`Wrote ${Object.keys(sorted).length}/${ids.length} image URLs (${pct}%) to ${OUT}`)

  const missing = ids.filter((id) => !sorted[id])
  if (missing.length > 0) {
    console.log(`\nNo image for ${missing.length} parts — they fall back to the category icon:`)
    for (const id of missing.slice(0, 25)) console.log(`  · ${id}`)
    if (missing.length > 25) console.log(`  … and ${missing.length - 25} more`)
  }
}

main()
