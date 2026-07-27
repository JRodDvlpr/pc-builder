import type { Offer, ProviderId } from '../scrape/types'
import { getDb } from './client'

interface OfferRow {
  part_id: string
  provider: ProviderId
  price: number
  url: string
  title: string
  in_stock: number
  match_score: number
  fetched_at: number
}

function toOffer(row: OfferRow): Offer {
  return {
    partId: row.part_id,
    provider: row.provider,
    price: row.price,
    url: row.url,
    title: row.title,
    inStock: row.in_stock === 1,
    matchScore: row.match_score,
    fetchedAt: row.fetched_at,
  }
}

export function getOffers(partIds: string[]): Map<string, Offer[]> {
  const result = new Map<string, Offer[]>()
  if (partIds.length === 0) return result

  const placeholders = partIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT * FROM offers WHERE part_id IN (${placeholders}) ORDER BY price ASC`)
    .all(...partIds) as OfferRow[]

  for (const row of rows) {
    const list = result.get(row.part_id) ?? []
    list.push(toOffer(row))
    result.set(row.part_id, list)
  }
  return result
}

export function saveOffer(offer: Offer): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO offers (part_id, provider, price, url, title, in_stock, match_score, fetched_at)
     VALUES (@partId, @provider, @price, @url, @title, @inStock, @matchScore, @fetchedAt)
     ON CONFLICT(part_id, provider) DO UPDATE SET
       price = excluded.price, url = excluded.url, title = excluded.title,
       in_stock = excluded.in_stock, match_score = excluded.match_score,
       fetched_at = excluded.fetched_at`,
  ).run({ ...offer, inStock: offer.inStock ? 1 : 0 })

  // Only append to history when the price actually moved, so the chart is
  // change points rather than one row per scrape.
  const last = db
    .prepare('SELECT price FROM price_history WHERE part_id = ? AND provider = ? ORDER BY seen_at DESC LIMIT 1')
    .get(offer.partId, offer.provider) as { price: number } | undefined

  if (!last || last.price !== offer.price) {
    db.prepare('INSERT INTO price_history (part_id, provider, price, seen_at) VALUES (?, ?, ?, ?)').run(
      offer.partId,
      offer.provider,
      offer.price,
      offer.fetchedAt,
    )
  }
}

export function logScrape(
  partId: string,
  provider: ProviderId,
  ok: boolean,
  matched: boolean,
  error?: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO scrape_log (part_id, provider, ok, matched, error, attempted_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(part_id, provider) DO UPDATE SET
         ok = excluded.ok, matched = excluded.matched,
         error = excluded.error, attempted_at = excluded.attempted_at`,
    )
    .run(partId, provider, ok ? 1 : 0, matched ? 1 : 0, error ?? null, Date.now())
}

/** Last attempt time per part, used to avoid re-scraping a known miss. */
export function lastAttempts(partIds: string[]): Map<string, number> {
  const result = new Map<string, number>()
  if (partIds.length === 0) return result
  const placeholders = partIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT part_id, MAX(attempted_at) AS attempted_at FROM scrape_log
       WHERE part_id IN (${placeholders}) GROUP BY part_id`,
    )
    .all(...partIds) as { part_id: string; attempted_at: number }[]
  for (const row of rows) result.set(row.part_id, row.attempted_at)
  return result
}

export function priceHistory(partId: string, limit = 90): { price: number; seenAt: number }[] {
  const rows = getDb()
    .prepare(
      'SELECT price, seen_at FROM price_history WHERE part_id = ? ORDER BY seen_at DESC LIMIT ?',
    )
    .all(partId, limit) as { price: number; seen_at: number }[]
  return rows.map((r) => ({ price: r.price, seenAt: r.seen_at })).reverse()
}

export function saveBuild(slug: string, payload: string): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO builds (slug, payload, created_at) VALUES (?, ?, ?)')
    .run(slug, payload, Date.now())
}

export function loadBuild(slug: string): string | null {
  const row = getDb().prepare('SELECT payload FROM builds WHERE slug = ?').get(slug) as
    | { payload: string }
    | undefined
  return row?.payload ?? null
}

export interface ScrapeStats {
  offers: number
  parts: number
  attempted: number
  matched: number
  lastFetch: number | null
}

export function scrapeStats(): ScrapeStats {
  const db = getDb()
  const offers = db.prepare('SELECT COUNT(*) AS n, MAX(fetched_at) AS last FROM offers').get() as {
    n: number
    last: number | null
  }
  const parts = db.prepare('SELECT COUNT(DISTINCT part_id) AS n FROM offers').get() as { n: number }
  const log = db
    .prepare('SELECT COUNT(*) AS attempted, SUM(matched) AS matched FROM scrape_log')
    .get() as { attempted: number; matched: number | null }

  return {
    offers: offers.n,
    parts: parts.n,
    attempted: log.attempted,
    matched: log.matched ?? 0,
    lastFetch: offers.last,
  }
}
