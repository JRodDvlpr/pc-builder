import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getPart } from '@/lib/catalog'
import type { Offer } from '@/lib/scrape/types'

/**
 * The price plausibility guard.
 *
 * Matching establishes that a listing is the right *product*; nothing
 * established that its price is believable, and the audit that prompted these
 * tests found that gap cost real money in both directions — a $1,599 monitor
 * shown at $8.88, a $549 CPU shown at $7,893.99. The second is unfixable by any
 * matching rule: Newegg's own listing for a Threadripper carries the 9900X3D's
 * part number, so identity matching is *correct* and still wrong.
 */

let dir: string
let queries: typeof import('@/lib/db/queries')
let cache: typeof import('@/lib/scrape/cache')

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pcb-plaus-'))
  process.env.PC_BUILDER_DB = join(dir, 'test.db')
  queries = await import('@/lib/db/queries')
  cache = await import('@/lib/scrape/cache')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.PC_BUILDER_DB
})

beforeEach(() => {
  queries.clearOffers()
})

const PART = 'cpu-9900x3d'
const reference = () => getPart(PART)!.seedPrice

function offer(partial: Partial<Offer> = {}): Offer {
  return {
    partId: PART,
    provider: 'newegg',
    price: reference(),
    url: 'https://example.com/p',
    title: 'AMD Ryzen 9 9900X3D',
    inStock: true,
    matchScore: 1,
    fetchedAt: Date.now(),
    ...partial,
  }
}

describe('withholding an implausible price', () => {
  it('rejects a wildly high price and falls back to the reference', () => {
    // The real regression: Newegg lists a Threadripper PRO 9985WX carrying the
    // 9900X3D's part number, so it matches at full confidence.
    queries.saveOffer(offer({ price: 7893.99, title: 'AMD Ryzen Threadripper PRO 9985WX … 100-100000722WOF' }))

    const info = cache.readPrices([PART])[PART]
    expect(info.price).toBe(reference())
    expect(info.source).toBe('seed')
    expect(info.confidence).toBe('none')
    expect(info.rejected).toBe(1)
  })

  it('rejects a price far below the reference', () => {
    queries.saveOffer(offer({ price: 8.88 }))

    const info = cache.readPrices([PART])[PART]
    expect(info.price).toBe(reference())
    expect(info.rejected).toBe(1)
  })

  it('keeps a price that merely moved a lot', () => {
    // Genuine sales and shortages move real prices; the band must be wide
    // enough not to fight them.
    queries.saveOffer(offer({ price: reference() * 2 }))

    const info = cache.readPrices([PART])[PART]
    expect(info.price).toBe(reference() * 2)
    expect(info.source).not.toBe('seed')
    expect(info.rejected).toBeUndefined()
  })

  it('still quotes a plausible offer when another is withheld', () => {
    queries.saveOffer(offer({ provider: 'newegg', price: 7893.99 }))
    queries.saveOffer(offer({ provider: 'amazon', price: reference() * 1.1 }))

    const info = cache.readPrices([PART])[PART]
    expect(info.price).toBeCloseTo(reference() * 1.1, 2)
    expect(info.rejected).toBe(1)
    expect(info.offers).toHaveLength(1)
  })
})

describe('reporting how well corroborated a price is', () => {
  it('marks two retailers that agree as corroborated', () => {
    queries.saveOffer(offer({ provider: 'newegg', price: 500 }))
    queries.saveOffer(offer({ provider: 'amazon', price: 540 }))

    expect(cache.readPrices([PART])[PART].confidence).toBe('corroborated')
  })

  it('marks two retailers that disagree as single', () => {
    // 500 vs 900 is 1.8x apart — one of them is wrong, so neither is confirmed.
    queries.saveOffer(offer({ provider: 'newegg', price: 500 }))
    queries.saveOffer(offer({ provider: 'amazon', price: 900 }))

    expect(cache.readPrices([PART])[PART].confidence).toBe('single')
  })

  it('marks a lone listing as single', () => {
    queries.saveOffer(offer({ price: 500 }))
    expect(cache.readPrices([PART])[PART].confidence).toBe('single')
  })

  it('marks a part with nothing usable as none', () => {
    expect(cache.readPrices([PART])[PART].confidence).toBe('none')
  })
})
