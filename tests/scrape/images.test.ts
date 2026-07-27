import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

  it('leaves the image undefined when nothing has been scraped', () => {
    const info = cache.readPrices(['cpu-9600x'])['cpu-9600x']
    expect(info.source).toBe('seed')
    expect(info.image).toBeUndefined()
  })
})
