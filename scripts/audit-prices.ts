/**
 * Is the price we show actually the price of the part?
 *
 * Identity matching and price plausibility are different problems, and the
 * scraper only ever solved the first. This reports on the second: how far the
 * prices we display sit from their reference, whether two retailers corroborate
 * each other, and which offers are implausible enough to be worth a human look.
 *
 * The corroboration table is the interesting one. Where two independent
 * retailers agree on a part, their consensus is better evidence of the market
 * than the committed reference is — so a category whose corroborated prices sit
 * consistently above the reference means the *reference* has gone stale, not
 * that the scrape is broken.
 *
 *   npm run audit:prices
 *   npm run audit:prices -- --offers      list every implausible offer
 */
import { ALL_PARTS, getPart } from '../src/lib/catalog'
import type { Category } from '../src/lib/catalog/types'
import { getOffers } from '../src/lib/db/queries'
import { readPrices } from '../src/lib/scrape/cache'

/** Two prices this close are treated as the same price. */
const AGREEMENT = 1.25

function pct(n: number, of: number): string {
  return of === 0 ? '0%' : `${((n / of) * 100).toFixed(0)}%`
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function main() {
  const ids = ALL_PARTS.map((p) => p.id)
  const offersByPart = getOffers(ids)
  const prices = readPrices(ids)
  const allOffers = ids.flatMap((id) => offersByPart.get(id) ?? [])

  console.log(`\n${allOffers.length} cached offers across ${offersByPart.size} parts\n`)

  // ---- How far do displayed prices sit from their reference? -------------
  const priced = ids.filter((id) => prices[id].source !== 'seed')
  const buckets = { '>3x': 0, '2-3x': 0, '1.5-2x': 0, 'within 1.5x': 0, '0.4-0.67x': 0, '<0.4x': 0 }
  for (const id of priced) {
    const r = prices[id].price / getPart(id)!.seedPrice
    if (r > 3) buckets['>3x']++
    else if (r > 2) buckets['2-3x']++
    else if (r > 1.5) buckets['1.5-2x']++
    else if (r > 0.67) buckets['within 1.5x']++
    else if (r > 0.4) buckets['0.4-0.67x']++
    else buckets['<0.4x']++
  }
  console.log(`Displayed price vs reference (${priced.length} parts with a scraped price):`)
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(13)} ${String(v).padStart(4)}  ${pct(v, priced.length)}`)
  }

  // ---- Do the two retailers agree? ---------------------------------------
  let agree = 0
  let disagree = 0
  let single = 0
  const factors: Partial<Record<Category, number[]>> = {}
  const disagreements: { id: string; lo: number; hi: number; spread: number }[] = []

  for (const id of ids) {
    const os = offersByPart.get(id) ?? []
    if (os.length === 0) continue
    const providers = new Set(os.map((o) => o.provider))
    if (providers.size < 2) {
      single++
      continue
    }
    const lo = Math.min(...os.map((o) => o.price))
    const hi = Math.max(...os.map((o) => o.price))
    if (hi / lo <= AGREEMENT) {
      agree++
      const part = getPart(id)!
      ;(factors[part.category] ??= []).push((lo + hi) / 2 / part.seedPrice)
    } else {
      disagree++
      disagreements.push({ id, lo, hi, spread: hi / lo })
    }
  }

  console.log(`\nCross-provider corroboration:`)
  console.log(`  both retailers agree within ${((AGREEMENT - 1) * 100).toFixed(0)}%   ${agree}`)
  console.log(`  they disagree by more          ${disagree}`)
  console.log(`  only one retailer listed it    ${single}  (no cross-check possible)`)

  // ---- Where the reference has drifted from the market -------------------
  console.log(`\nCorroborated market price vs catalog reference — a category well above`)
  console.log(`1.0x means the reference is stale, not that the scrape is wrong:`)
  for (const [cat, v] of Object.entries(factors).sort()) {
    if (!v?.length) continue
    const s = [...v].sort((a, b) => a - b)
    console.log(
      `  ${cat.padEnd(12)} n=${String(v.length).padEnd(4)} median ${median(v).toFixed(2)}x` +
        `   range ${s[0].toFixed(2)}x .. ${s[s.length - 1].toFixed(2)}x`,
    )
  }

  if (disagreements.length > 0) {
    console.log(`\nWidest retailer disagreements (one of the two is usually wrong):`)
    for (const d of disagreements.sort((a, b) => b.spread - a.spread).slice(0, 10)) {
      console.log(
        `  ${d.spread.toFixed(1).padStart(6)}x  $${d.lo.toFixed(2).padEnd(10)} .. $${d.hi.toFixed(2).padEnd(10)} ${d.id}`,
      )
    }
  }

  // ---- Offers a human should look at -------------------------------------
  const suspect = allOffers
    .map((o) => {
      const part = getPart(o.partId)!
      return { o, part, ratio: o.price / part.seedPrice }
    })
    .filter(({ ratio }) => ratio > 2.5 || ratio < 0.35)
    .sort((a, b) => b.ratio - a.ratio)

  console.log(`\n${suspect.length} of ${allOffers.length} offers fall outside 0.35x–2.5x of reference.`)
  if (process.argv.includes('--offers')) {
    for (const { o, part, ratio } of suspect) {
      console.log(
        `  ${ratio.toFixed(2).padStart(7)}x  $${o.price.toFixed(2).padEnd(10)} ref $${String(part.seedPrice).padEnd(7)} ${o.partId.padEnd(28)} ${o.title.slice(0, 80)}`,
      )
    }
  } else {
    console.log(`Re-run with --offers to list them.`)
  }
  console.log()
}

main()
