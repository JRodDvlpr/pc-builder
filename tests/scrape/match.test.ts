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

  it('matches a part whose catalog name carries a model year the listing omits', () => {
    // Regression: "(2023)" became a required token, so every CX650 listing was
    // rejected and the part fell back to its seed price forever.
    const score = scoreListing(
      part('psu-cx650'),
      listing('Corsair CX650 80 Plus Bronze Non Modular Low-Noise ATX 650 Watt Power Supply - NA - Black'),
    )
    expect(score).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('still matches when the listing does spell the model year out', () => {
    const score = scoreListing(
      part('psu-cx650'),
      listing('Corsair CX650 (2023) 80 Plus Bronze Non Modular Low-Noise ATX 650 Watt Power Supply'),
    )
    expect(score).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('ignores a parenthetical revision marker', () => {
    // "M27Q (rev 2.0)" required the literal tokens "2" and "0".
    const score = scoreListing(
      part('mon-gigabyte-m27q'),
      listing('GIGABYTE M27Q 27" 170Hz 1440P KVM Gaming Monitor, 2560 x 1440 SS IPS Display'),
    )
    expect(score).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('does not treat a memory kit capacity as a droppable aside', () => {
    // The year/revision rule must not loosen "(2x16GB)", which is identifying.
    const score = scoreListing(
      part('mem-tz5-6000c30-32'),
      listing('G.SKILL Trident Z5 Neo RGB Series AMD EXPO 96GB (2 x 48GB) 288-Pin PC RAM DDR5 6000 CL30'),
    )
    expect(score).toBeLessThan(MATCH_THRESHOLD)
  })

  it('matches a memory kit whose title omits the CAS latency', () => {
    // Regression: Newegg encodes latency in the part number and never writes
    // "CL30" in the title, so requiring it blocked the whole memory category.
    const score = scoreListing(
      part('mem-vengeance-rgb-6000c30-64'),
      listing(
        'CORSAIR Vengeance RGB 64GB (2 x 32GB) 288-Pin PC RAM DDR5 6000 (PC5 48000) Desktop Memory Model CMH64GX5M2B6000C30',
      ),
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

  it('rejects a variant suffix on the part number', () => {
    // Regression: a substring test matched "LANCOOL 216" inside "LANCOOL 216RX"
    // and priced a different case at full confidence.
    const rx = listing(
      'LIAN LI LANCOOL 216RX Black Steel / Tempered Glass ATX Mid Tower Computer Case, 2x 16 cm ARGB Fans Included',
    )
    expect(scoreListing(part('case-lancool-216'), rx)).toBeLessThan(MATCH_THRESHOLD)
  })

  it('still accepts the exact case it is looking for', () => {
    const exact = listing(
      'LIAN LI LANCOOL 216 Black Steel / Tempered Glass ATX Mid Tower Computer Case',
    )
    expect(scoreListing(part('case-lancool-216'), exact)).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('rejects a dust filter kit sold under the case name', () => {
    // Regression: this was matched at 0.95 and showed the case as costing $14.99.
    expect(
      scoreListing(
        part('case-lancool-216'),
        listing('Lian-li Lan216-2x Lancool 216 Dust Filter Kit Black Retail', 14.99),
      ),
    ).toBe(0)
  })

  it('keeps matching part numbers that contain punctuation', () => {
    // The token-run check must not break MPNs written with dashes or slashes.
    expect(
      scoreListing(
        part('ssd-990pro-1tb'),
        listing('SAMSUNG 990 PRO M.2 2280 1TB PCIe 4.0 NVMe SSD MZ-V9P1T0B/AM'),
      ),
    ).toBeGreaterThanOrEqual(0.95)
    expect(
      scoreListing(
        part('cpu-9800x3d'),
        listing('AMD Ryzen 7 9800X3D Desktop Processor 100-100001084WOF'),
      ),
    ).toBeGreaterThanOrEqual(0.95)
  })

  it('rejects a kit that states a different CAS latency', () => {
    // Omitting the latency is fine; contradicting it is not.
    const score = scoreListing(
      part('mem-vengeance-rgb-6000c30-64'),
      listing('CORSAIR Vengeance RGB 64GB (2 x 32GB) DDR5 6000 CL36 Desktop Memory'),
    )
    expect(score).toBe(0)
  })

  it('rejects an AC power cord sold under the monitor it fits', () => {
    // Regression: this priced a $1,599 Dell UltraSharp at $8.88, because the
    // cheapest offer wins and nothing rejected it.
    expect(
      scoreListing(
        part('mon-dell-u4025qw'),
        listing('AC Power Cord for Dell UltraSharp U4025QW U4323QE U4924DW Monitor 40" 43" | 3-Prong', 8.88),
      ),
    ).toBe(0)
  })

  it('rejects a replacement remote listed under the monitor', () => {
    expect(
      scoreListing(
        part('mon-lg-27gs95qe'),
        listing('PERFASCIN AKB76044701 Replaced Remote Control fit for LG Ultragear OLED QHD Monitor 27GR95QE', 11.76),
      ),
    ).toBe(0)
  })

  it('rejects a toy car that happens to share a part number', () => {
    // "C8 BLACK" tokenises to `c8 · black`, which the MPN route took as proof.
    // A part number has to look like one before it is trusted.
    expect(
      scoreListing(part('case-antec-c8'), listing('Matchbox 2020 Corvete C8, Black', 22.29)),
    ).toBeLessThan(MATCH_THRESHOLD)
  })

  it('rejects the DDR4 board when the part is the DDR5 one', () => {
    // Same model name, different product, $651.92 vs $139.99.
    expect(
      scoreListing(
        part('mb-b760-tomahawk'),
        listing('MSI MAG B760 TOMAHAWK WIFI DDR4 LGA 1700 (Intel12th&13th Gen) SATA 6Gb/s ATX Motherboard', 651.92),
      ),
    ).toBe(0)
  })

  it('still accepts the DDR5 board it is looking for', () => {
    expect(
      scoreListing(
        part('mb-b760-tomahawk'),
        listing('MSI MAG B760 Tomahawk WiFi Gaming Motherboard (LGA 1700, DDR5, PCIe 5.0, M.2)', 139.99),
      ),
    ).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('does not treat a power supply as a power cord', () => {
    // A PSU listing is largely about its cables; the cable terms must not
    // disqualify one, or the real $289 NZXT went out with the $8.88 cord.
    expect(
      scoreListing(
        part('psu-nzxt-c850'),
        listing('NZXT C850 - C Series ATX 850 Watt 80 Plus Gold v2 (2022) Full-modular Power Supply, US Power Cord', 289),
      ),
    ).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('still rejects a filter kit named after the case', () => {
    // The PSU cable exemption must not leak into other categories.
    expect(
      scoreListing(
        part('case-lancool-216'),
        listing('Lian-li Lan216-2x Lancool 216 Dust Filter Kit Black Retail', 14.99),
      ),
    ).toBe(0)
  })

  it('tolerates a retailer that abbreviates the brand', () => {
    // "Western Digital" ships as "WD_BLACK"; requiring the catalog spelling
    // rejected 15 legitimate listings during calibration.
    expect(
      scoreListing(
        part('ssd-sn850x-1tb'),
        listing('WD_BLACK 1TB SN850X NVMe Internal Gaming SSD Solid State Drive - Gen4 PCIe, M.2 2280', 201.98),
      ),
    ).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('does not mistake socket support for an accessory listing', () => {
    // "for AMD" / "for Intel" are compatibility statements on the real cooler.
    expect(
      scoreListing(
        part('cool-nh-l9a'),
        listing('Noctua NH-L9a-AM5 chromax.black, Premium Low-profile CPU Cooler for AMD AM5', 59.95),
      ),
    ).toBeGreaterThan(MATCH_THRESHOLD)
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
