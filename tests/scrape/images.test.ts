import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import rawSeedImages from '../../data/seed-images.json'
import { ALL_PARTS } from '@/lib/catalog'
import { seedImage, seedImageCount } from '@/lib/scrape/seed-images'
import type { Offer } from '@/lib/scrape/types'

/**
 * Product thumbnails come from the retailer listing alongside the price, so they
 * live in the offers cache rather than the committed catalog. These cover the
 * bits that are easy to break silently: the column surviving a schema that
 * predates it, and a scrape that finds no image not wiping one already stored.
 */

let dbPath: string
let dir: string
let queries: typeof import('@/lib/db/queries')
let cache: typeof import('@/lib/scrape/cache')

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pcb-img-'))
  dbPath = join(dir, 'test.db')
  process.env.PC_BUILDER_DB = dbPath
  // Imported after the env var is set so the client opens the temp database.
  queries = await import('@/lib/db/queries')
  cache = await import('@/lib/scrape/cache')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.PC_BUILDER_DB
})

function offer(partial: Partial<Offer> = {}): Offer {
  return {
    partId: 'cpu-9800x3d',
    provider: 'newegg',
    price: 479,
    url: 'https://example.com/p',
    title: 'AMD Ryzen 7 9800X3D',
    inStock: true,
    matchScore: 1,
    image: 'https://cdn.example.com/9800x3d.png',
    fetchedAt: Date.now(),
    ...partial,
  }
}

describe('offer image persistence', () => {
  it('round-trips an image URL through the cache', () => {
    queries.saveOffer(offer())
    const stored = queries.getOffers(['cpu-9800x3d']).get('cpu-9800x3d')
    expect(stored?.[0].image).toBe('https://cdn.example.com/9800x3d.png')
  })

  it('surfaces the image on the price payload the client reads', () => {
    const info = cache.readPrices(['cpu-9800x3d'])['cpu-9800x3d']
    expect(info.image).toBe('https://cdn.example.com/9800x3d.png')
  })

  it('keeps an existing image when a later scrape finds none', () => {
    // Newegg re-scraped with no thumbnail in the markup this time.
    queries.saveOffer(offer({ price: 459, image: undefined }))
    const stored = queries.getOffers(['cpu-9800x3d']).get('cpu-9800x3d')
    expect(stored?.[0].price).toBe(459)
    expect(stored?.[0].image).toBe('https://cdn.example.com/9800x3d.png')
  })

  it('takes an image from another provider when the cheapest offer lacks one', () => {
    queries.saveOffer(
      offer({ partId: 'gpu-5070-fe', provider: 'newegg', price: 549, image: undefined }),
    )
    queries.saveOffer(
      offer({
        partId: 'gpu-5070-fe',
        provider: 'amazon',
        price: 599,
        image: 'https://cdn.example.com/5070.jpg',
      }),
    )
    const info = cache.readPrices(['gpu-5070-fe'])['gpu-5070-fe']
    expect(info.price).toBe(549)
    expect(info.image).toBe('https://cdn.example.com/5070.jpg')
  })

  it('falls back to the committed image when nothing has been scraped', () => {
    // The cold-start path, and on Vercel the common one: /tmp is wiped on every
    // deploy, so without this the whole catalog would render as category icons.
    const info = cache.readPrices(['cpu-9600x'])['cpu-9600x']
    expect(info.source).toBe('seed')
    expect(info.image).toBe(seedImage('cpu-9600x'))
    expect(info.image).toMatch(/^https:\/\//)
  })

  it('prefers a scraped image over the committed one', () => {
    // The committed URL can go stale; a live listing is always more current.
    expect(seedImage('cpu-9800x3d')).toBeDefined()
    const info = cache.readPrices(['cpu-9800x3d'])['cpu-9800x3d']
    expect(info.image).toBe('https://cdn.example.com/9800x3d.png')
  })

  it('leaves the image undefined for a part the map does not cover', () => {
    const uncovered = ALL_PARTS.find((p) => !seedImage(p.id) && p.id !== 'gpu-5070-fe')
    if (!uncovered) return // full coverage is a fine reason to skip
    expect(cache.readPrices([uncovered.id])[uncovered.id].image).toBeUndefined()
  })
})

describe('the committed image map', () => {
  it('covers most of the catalog', () => {
    // A guard against the export script silently writing an near-empty file:
    // that would degrade every part to an icon without failing anything else.
    expect(seedImageCount()).toBeGreaterThan(ALL_PARTS.length * 0.75)
  })

  it('only contains parts that still exist', () => {
    const ids = new Set(ALL_PARTS.map((p) => p.id))
    const orphans = Object.keys(rawSeedImages).filter((id) => !ids.has(id))
    expect(orphans).toEqual([])
  })

  it('stores absolute https URLs, never inlined image data', () => {
    for (const url of Object.values(rawSeedImages as Record<string, string>)) {
      expect(url).toMatch(/^https:\/\//)
    }
  })
})
