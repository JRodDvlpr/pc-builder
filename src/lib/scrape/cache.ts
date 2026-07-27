import { getPart } from '../catalog'
import type { Part } from '../catalog/types'
import { getOffers, lastAttempts, logScrape, saveOffer } from '../db/queries'
import { amazon } from './providers/amazon'
import { newegg } from './providers/newegg'
import { bestMatch, searchQueries } from './match'
import type { Offer, PriceInfo, PriceProvider, PriceSource } from './types'

export const PROVIDERS: PriceProvider[] = [newegg, amazon]

/** Offers newer than this are served as-is. */
const FRESH_MS = 6 * 60 * 60 * 1000
/** Older than this and the cached price is no longer worth showing. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000
/** How long to wait before re-attempting a part that matched nothing. */
const MISS_RETRY_MS = 24 * 60 * 60 * 1000

/**
 * Reads are always instant.
 *
 * The API answers from SQLite — or from the committed seed price when there is
 * nothing cached — and schedules a refresh in the background. Nothing the user
 * does ever waits on a retailer, which is what keeps the table responsive when
 * Newegg is slow and usable when it blocks us outright.
 */
export function readPrices(partIds: string[]): Record<string, PriceInfo> {
  const offersByPart = getOffers(partIds)
  const now = Date.now()
  const out: Record<string, PriceInfo> = {}

  for (const partId of partIds) {
    const part = getPart(partId)
    if (!part) continue

    const offers = (offersByPart.get(partId) ?? []).filter((o) => now - o.fetchedAt < STALE_MS)
    // Prefer in-stock listings; fall back to out-of-stock rather than showing nothing.
    const usable = offers.filter((o) => o.inStock)
    const chosen = (usable.length > 0 ? usable : offers).sort((a, b) => a.price - b.price)

    if (chosen.length === 0) {
      out[partId] = {
        partId,
        price: part.seedPrice,
        source: 'seed',
        fetchedAt: null,
        offers: [],
      }
      continue
    }

    const newest = Math.max(...chosen.map((o) => o.fetchedAt))
    const source: PriceSource = now - newest < FRESH_MS ? 'live' : 'cached'
    out[partId] = { partId, price: chosen[0].price, source, fetchedAt: newest, offers: chosen }
  }

  return out
}

/** Parts whose cached data is old enough to be worth re-fetching. */
export function needsRefresh(partIds: string[]): string[] {
  const offers = getOffers(partIds)
  const attempts = lastAttempts(partIds)
  const now = Date.now()

  return partIds.filter((id) => {
    const newest = offers.get(id)?.reduce((max, o) => Math.max(max, o.fetchedAt), 0) ?? 0
    if (newest && now - newest < FRESH_MS) return false
    // A part that matched nothing last time gets a longer cool-off than one
    // that simply has a stale price.
    const attempted = attempts.get(id) ?? 0
    if (!newest && attempted && now - attempted < MISS_RETRY_MS) return false
    return true
  })
}

/** Scrape one part across every provider. Resolves to the number of matches saved. */
export async function refreshPart(part: Part, signal?: AbortSignal): Promise<number> {
  const queries = searchQueries(part)
  let matches = 0

  for (const provider of PROVIDERS) {
    let matched = false
    let error: string | undefined

    for (const query of queries) {
      if (signal?.aborted) break
      try {
        const listings = await provider.search(query, signal)
        const match = bestMatch(part, listings)
        if (!match) continue

        const offer: Offer = {
          partId: part.id,
          provider: provider.id,
          price: match.listing.price,
          url: match.listing.url,
          title: match.listing.title,
          inStock: match.listing.inStock,
          matchScore: match.score,
          fetchedAt: Date.now(),
        }
        saveOffer(offer)
        matched = true
        matches += 1
        break // this provider is done; move to the next
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        // Try the next query form before giving up on this provider.
      }
    }

    logScrape(part.id, provider.id, error === undefined || matched, matched, matched ? undefined : error)
  }

  return matches
}

/** In-flight refreshes, so concurrent requests for the same part collapse into one. */
const inFlight = new Map<string, Promise<number>>()
const MAX_CONCURRENT = 2
let active = 0
const queue: (() => void)[] = []

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => queue.push(resolve))
}

function release() {
  const next = queue.shift()
  if (next) next()
  else active -= 1
}

/**
 * Fire-and-forget refresh. Deliberately not awaited by the request handler —
 * results land in SQLite and reach the user on their next poll or page load.
 */
export function refreshInBackground(partIds: string[]): void {
  for (const partId of partIds) {
    if (inFlight.has(partId)) continue
    const part = getPart(partId)
    if (!part) continue

    const task = acquire()
      .then(() => refreshPart(part))
      .catch(() => 0)
      .finally(() => {
        release()
        inFlight.delete(partId)
      })

    inFlight.set(partId, task)
  }
}
