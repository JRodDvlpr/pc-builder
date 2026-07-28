/** Shared by the scraper, the API route, and the client — keep it serialisable. */

export type ProviderId = 'newegg' | 'amazon'

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  newegg: 'Newegg',
  amazon: 'Amazon',
}

/** A raw search-result row, before it has been matched to a catalog part. */
export interface RawListing {
  title: string
  price: number
  url: string
  inStock: boolean
  image?: string
}

export interface PriceProvider {
  id: ProviderId
  search(query: string, signal?: AbortSignal): Promise<RawListing[]>
}

/** A listing that has been matched to a catalog part with enough confidence. */
export interface Offer {
  partId: string
  provider: ProviderId
  price: number
  url: string
  inStock: boolean
  title: string
  /** 0–1 confidence that this listing really is the catalog part. */
  matchScore: number
  /** Retailer CDN thumbnail, when the listing had one. */
  image?: string
  /** Epoch milliseconds. */
  fetchedAt: number
}

/**
 * Where a displayed price came from.
 *
 * `live`   — scraped within the freshness window.
 * `cached` — from a previous scrape, still being revalidated in the background.
 * `seed`   — the committed fallback; shown when scraping has never succeeded.
 */
export type PriceSource = 'live' | 'cached' | 'seed'

/**
 * How much corroboration a displayed price has.
 *
 * `corroborated` — two retailers independently agree, the strongest evidence.
 * `single`       — one plausible listing, believable but unverified.
 * `none`         — no usable listing; the committed reference is shown.
 */
export type PriceConfidence = 'corroborated' | 'single' | 'none'

export interface PriceInfo {
  partId: string
  /** Lowest plausible in-stock offer, or the seed price when there are none. */
  price: number
  source: PriceSource
  confidence: PriceConfidence
  fetchedAt: number | null
  /** First product thumbnail found across this part's offers, if any. */
  image?: string
  offers: Offer[]
  /** Offers withheld as implausible, so the UI can say the price was filtered. */
  rejected?: number
}

export interface PriceResponse {
  prices: Record<string, PriceInfo>
}
