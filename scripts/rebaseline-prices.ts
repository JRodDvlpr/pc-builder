/**
 * Bring the catalog's reference prices back in line with the market.
 *
 * `seedPrice` is the number shown when nothing scrapes, and it is the prior the
 * plausibility guard measures offers against — so when it drifts, both the
 * fallback and the guard are wrong at once. It had drifted badly: memory sat at
 * 4.7x and storage at 2.8x, because the values predate the DRAM/NAND spike.
 *
 * Only two kinds of evidence are accepted:
 *   1. Both retailers agree on the part → use their consensus directly.
 *   2. Anything else                    → scale by the category's median factor.
 *
 * Corroboration is what makes this safe to automate, and a single listing is
 * explicitly *not* corroboration — the audit that prompted this found lone
 * listings asking $5,829 for an RTX 4090 and $698 for a $130 hard drive. An
 * earlier draft nudged the reference halfway toward such listings and baked
 * marketplace inflation into 246 of 480 parts. Two independent retailers landing
 * within 25% of each other is hard to fake, so those parts alone set the
 * category factor that everything else is scaled by.
 *
 *   npm run rebaseline:prices              # preview, writes nothing
 *   npm run rebaseline:prices -- --write   # apply to data/catalog/*.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ALL_PARTS, getPart } from '../src/lib/catalog'
import { CATEGORIES, type Category } from '../src/lib/catalog/types'
import { getOffers } from '../src/lib/db/queries'

/** Two prices this close are treated as corroborating each other. */
const AGREEMENT = 1.25
/** Prices are presented rounded; sub-dollar precision is noise. */
const round = (n: number) => Math.round(n)

interface Evidence {
  consensus?: number
}

function gather(): Map<string, Evidence> {
  const offers = getOffers(ALL_PARTS.map((p) => p.id))
  const out = new Map<string, Evidence>()

  for (const part of ALL_PARTS) {
    const os = offers.get(part.id) ?? []
    if (os.length === 0) continue

    // One price per provider — the cheapest, matching what the app quotes.
    const perProvider = new Map<string, number>()
    for (const o of os) {
      const seen = perProvider.get(o.provider)
      if (seen === undefined || o.price < seen) perProvider.set(o.provider, o.price)
    }
    const quotes = [...perProvider.values()].sort((a, b) => a - b)

    if (quotes.length >= 2 && quotes[quotes.length - 1] / quotes[0] <= AGREEMENT) {
      out.set(part.id, { consensus: (quotes[0] + quotes[quotes.length - 1]) / 2 })
    }
  }
  return out
}

/** Median ratio of corroborated market price to reference, per category. */
function categoryFactors(evidence: Map<string, Evidence>): Record<Category, number> {
  const ratios: Partial<Record<Category, number[]>> = {}
  for (const [id, e] of evidence) {
    if (e.consensus === undefined) continue
    const part = getPart(id)!
    ;(ratios[part.category] ??= []).push(e.consensus / part.seedPrice)
  }

  const factors = {} as Record<Category, number>
  for (const category of CATEGORIES) {
    const v = (ratios[category] ?? []).sort((a, b) => a - b)
    // Too little evidence to move a whole category on; leave it alone.
    factors[category] = v.length >= 3 ? v[Math.floor(v.length / 2)] : 1
  }
  return factors
}

function main() {
  const write = process.argv.includes('--write')
  const evidence = gather()
  const factors = categoryFactors(evidence)

  console.log('Category factors from corroborated parts (1.00 = leave alone):')
  for (const c of CATEGORIES) console.log(`  ${c.padEnd(12)} ${factors[c].toFixed(2)}x`)

  const updates = new Map<string, number>()
  const why: Record<string, number> = { consensus: 0, scaled: 0, unchanged: 0 }

  for (const part of ALL_PARTS) {
    const consensus = evidence.get(part.id)?.consensus
    let next: number

    if (consensus !== undefined) {
      next = round(consensus)
      why.consensus++
    } else {
      next = round(part.seedPrice * factors[part.category])
      why.scaled++
    }

    if (next > 0 && next !== part.seedPrice) updates.set(part.id, next)
    else why.unchanged++
  }

  console.log(
    `\nEvidence used: ${why.consensus} corroborated, ${why.scaled} scaled by category factor.`,
  )
  console.log(`${updates.size} of ${ALL_PARTS.length} reference prices change.\n`)

  const biggest = [...updates.entries()]
    .map(([id, next]) => ({ id, from: getPart(id)!.seedPrice, to: next }))
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
  console.log('Largest movements:')
  for (const b of biggest.slice(0, 15)) {
    console.log(`  ${b.id.padEnd(30)} $${String(b.from).padEnd(7)} -> $${b.to}`)
  }

  if (!write) {
    console.log('\nPreview only. Re-run with --write to apply.')
    return
  }

  for (const category of CATEGORIES) {
    const file = join(process.cwd(), 'data', 'catalog', `${category}.json`)
    const parts = JSON.parse(readFileSync(file, 'utf8')) as { id: string; seedPrice: number }[]
    let touched = 0
    for (const p of parts) {
      const next = updates.get(p.id)
      if (next !== undefined) {
        p.seedPrice = next
        touched++
      }
    }
    if (touched > 0) {
      // One object per line, matching how the catalog is already stored. Writing
      // pretty-printed JSON instead turned a 423-line price change into a
      // 9,114-line reformat, which is unreviewable — and being able to review
      // this diff is the entire reason the script writes a file rather than
      // updating the numbers in place.
      writeFileSync(file, `[\n${parts.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`)
      console.log(`  ${category}.json — ${touched} updated`)
    }
  }
  console.log('\nWritten. Review the diff before committing.')
}

main()
