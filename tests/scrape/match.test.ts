import { describe, expect, it } from 'vitest'

import { getPart } from '@/lib/catalog'
import { MATCH_THRESHOLD, bestMatch, scoreListing, searchQueries } from '@/lib/scrape/match'
import type { RawListing } from '@/lib/scrape/types'

/**
 * Every title in this file was captured from a real Newegg or Amazon search
 * during development. The wrong-match cases are ones the matcher actually got
 * wrong before it was tightened, so they are regression tests, not hypotheticals.
 */
function listing(title: string, price = 100, inStock = true): RawListing {
  return { title, price, url: 'https://example.com/p', inStock }
}

const part = (id: string) => {
  const p = getPart(id)
  if (!p) throw new Error(`fixture part missing: ${id}`)
  return p
}

describe('accepting the right listing', () => {
  it('matches on an exact MPN', () => {
    const score = scoreListing(
      part('ssd-990pro-1tb'),
      listing('SAMSUNG 990 PRO M.2 2280 1TB PCIe 4.0 NVMe V-NAND SSD MZ-V9P1T0B/AM New'),
    )
    expect(score).toBeGreaterThanOrEqual(0.95)
  })

  it('matches on model tokens when the MPN is absent', () => {
    const score = scoreListing(
      part('ssd-990pro-1tb'),
      listing('SAMSUNG 990 PRO SSD 1TB PCIe 4.0 M.2 2280 Internal Solid State Hard Drive'),
    )
    expect(score).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('matches a memory kit whose title spaces out the module count', () => {
    // Catalog says "(2x16GB)"; Newegg writes "(2 x 16GB)".
    const score = scoreListing(
      part('mem-tz5-6000c30-32'),
      listing('G.SKILL Trident Z5 Neo RGB Series AMD EXPO 32GB (2 x 16GB) 288-Pin PC RAM DDR5 6000 CL30'),
    )
    expect(score).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('matches a CPU listed with its full retail name', () => {
    const score = scoreListing(
      part('cpu-9950x3d'),
      listing('AMD Ryzen 9 9950X3D - Ryzen 9 9000 Series Granite Ridge (Zen 5) 16-Core 4.3 GHz Socket AM5 170W'),
    )
    expect(score).toBeGreaterThan(MATCH_THRESHOLD)
  })
})

describe('rejecting the wrong listing', () => {
  it('rejects a 3-pack when the part is a 5-pack', () => {
    // Regression: "5" used to match as a substring anywhere in the title.
    const score = scoreListing(
      part('fan-p12-pst-5'),
      listing('ARCTIC P12 PWM PST A-RGB (3 Pack) - 120 mm PWM case Fan Optimized for Static Pressure'),
    )
    expect(score).toBeLessThan(MATCH_THRESHOLD)
  })

  it('accepts the matching 5-pack', () => {
    const score = scoreListing(
      part('fan-p12-pst-5'),
      listing('ARCTIC P12 PWM PST (5 Pack) - 120 mm Case Fan, PWM Sharing Technology'),
    )
    expect(score).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('rejects a CPU + motherboard bundle', () => {
    // Regression: this used to be accepted at 0.95 and inflated the total.
    const score = scoreListing(
      part('cpu-9950x3d'),
      listing('AMD 9950X3D Processor with GIGABYTE X870E AORUS Elite WIFI7 ICE Motherboard | Micro Center CPU'),
    )
    expect(score).toBe(0)
  })

  it('rejects an accessory that names the part', () => {
    expect(
      scoreListing(part('gpu-5090-fe'), listing('Anti-Sag GPU Support Bracket for RTX 5090 Graphics Card')),
    ).toBe(0)
  })

  it('does not confuse adjacent models', () => {
    const ti = listing('MSI GeForce RTX 5070 Ti 16G VENTUS 3X OC Graphics Card')
    expect(scoreListing(part('gpu-5070-ventus'), ti)).toBeLessThan(MATCH_THRESHOLD)
  })

  it('penalises refurbished stock', () => {
    const newItem = listing('SAMSUNG 990 PRO SSD 1TB PCIe 4.0 M.2 2280 Internal Solid State Drive')
    const refurb = listing('Refurbished: SAMSUNG 990 PRO SSD 1TB PCIe 4.0 M.2 2280 Internal Solid State Drive')
    expect(scoreListing(part('ssd-990pro-1tb'), refurb)).toBeLessThan(
      scoreListing(part('ssd-990pro-1tb'), newItem),
    )
  })
})

describe('choosing among candidates', () => {
  it('prefers an exact part-number hit over a similarly named variant', () => {
    const p = part('case-o11d-evo') // O11DEX, the non-RGB model
    const match = bestMatch(p, [
      listing('LIAN LI O11 Dynamic EVO RGB Black Aluminum / Steel / Tempered Glass ATX Mid Tower', 167.99),
      listing('LIAN LI O11 Dynamic EVO O11DEX Black Aluminum / Steel / Tempered Glass ATX Mid Tower', 189.99),
    ])
    expect(match?.listing.title).toContain('O11DEX')
  })

  it('takes the cheaper of two equally confident listings', () => {
    const p = part('ssd-990pro-1tb')
    const match = bestMatch(p, [
      listing('SAMSUNG 990 PRO M.2 2280 1TB PCIe 4.0 NVMe V-NAND SSD MZ-V9P1T0B/AM', 299.95),
      listing('SAMSUNG 990 PRO M.2 2280 1TB PCIe 4.0 NVMe V-NAND SSD MZ-V9P1T0B/AM New', 239.99),
    ])
    expect(match?.listing.price).toBe(239.99)
  })

  it('returns null rather than guessing when nothing is convincing', () => {
    expect(
      bestMatch(part('gpu-5090-fe'), [
        listing('Generic Graphics Card Cooler'),
        listing('PCIe 5.0 Riser Cable 4.0 High Speed'),
      ]),
    ).toBeNull()
  })

  it('ignores listings with a nonsensical price', () => {
    const p = part('ssd-990pro-1tb')
    expect(bestMatch(p, [listing('SAMSUNG 990 PRO SSD 1TB PCIe 4.0 M.2 2280', 0)])).toBeNull()
  })
})

describe('search queries', () => {
  it('tries the part number before the descriptive name', () => {
    const queries = searchQueries(part('cpu-9800x3d'))
    expect(queries[0]).toBe('100-100001084WOF')
    expect(queries[1]).toContain('Ryzen 7 9800X3D')
  })
})
