import seedImages from '../../../data/seed-images.json'

/**
 * Committed product thumbnails, keyed by part id.
 *
 * Images arrive with prices, so a part only has one after it has been scraped —
 * and on Vercel the offer cache lives in /tmp, which is wiped on every cold
 * start. Without this, the first visitor after a deploy would see a grid of
 * category icons and the catalog would look empty of product photography.
 *
 * Only URLs are committed, never the bytes: the retailer CDN still serves the
 * image, and `scripts/export-images.ts` regenerates the file from whatever the
 * cache has found. A live offer's own image always wins, so a stale URL here is
 * superseded as soon as the part is scraped again rather than being sticky.
 *
 * Kept server-side deliberately. It is ~35 KB of URLs for ~400 parts, and the
 * client only ever needs the handful for the rows on screen, which already come
 * down with the prices.
 */
const IMAGES = seedImages as Record<string, string>

export function seedImage(partId: string): string | undefined {
  return IMAGES[partId]
}

/** Parts covered by the committed map — used by tests to guard against regressions. */
export function seedImageCount(): number {
  return Object.keys(IMAGES).length
}
