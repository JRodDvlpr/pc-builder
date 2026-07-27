import type { Part } from '../catalog/types'
import type { RawListing } from './types'

/**
 * Matching a retailer listing to a catalog part.
 *
 * The guiding rule: showing the wrong product's price is worse than showing no
 * price at all. A confident wrong number silently corrupts the build total,
 * while a missing one falls back to the reference price and says so. So the
 * threshold is deliberately high and every ambiguous case is rejected.
 */

/** Below this, the listing is discarded rather than shown. */
export const MATCH_THRESHOLD = 0.62

/** Words that mean the listing is a different product that merely mentions ours. */
const ACCESSORY_TERMS = [
  'bracket',
  'cable',
  'riser',
  'waterblock',
  'water block',
  'backplate',
  'anti-sag',
  'support stand',
  'gpu holder',
  'sticker',
  'decal',
  'skin',
  'dust cover',
  'screw',
  'thermal pad',
  'mounting kit',
  'replacement fan',
  'compatible with',
  'fits for',
  'for asus',
  'for msi',
  'for gigabyte',
]

/**
 * Multi-product listings. A CPU sold "with" a motherboard is a real product at
 * a real price, but it is not the price of the CPU, and letting one through
 * silently inflates the build total.
 */
const BUNDLE_TERMS = [
  'bundle',
  'combo',
  'processor with',
  'cpu with',
  'with motherboard',
  'motherboard combo',
  'micro center',
  'build kit',
  'barebones',
]

const CONDITION_TERMS = ['refurbished', 'renewed', 'used', 'open box', 'pre-owned', 'for parts']

/** Tokens too generic to count toward a match. */
const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'edition',
  'gaming',
  'series',
  'graphics',
  'card',
  'video',
  'desktop',
  'processor',
  'cpu',
  'motherboard',
  'memory',
  'ram',
  'kit',
  'ssd',
  'drive',
  'internal',
  'gen',
  'new',
])

function normalise(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      // "(2 x 16GB)" and "2x16GB" describe the same kit; collapse to one form so
      // a module-count token compares equal across retailers.
      .replace(/(\d+)\s+x\s+(\d+)/g, '$1x$2')
      .trim()
  )
}

/** MPNs vary in punctuation between retailers; compare them stripped. */
function normaliseMpn(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function tokenise(s: string): string[] {
  return normalise(s)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

/**
 * Tokens a listing must contain to be considered the same product.
 * Model numbers (tokens with digits) carry the identity, so they are required;
 * short alphabetic tokens are treated as optional flavour.
 */
function identifyingTokens(model: string): { required: string[]; optional: string[] } {
  const tokens = tokenise(model)
  const required: string[] = []
  const optional: string[] = []
  for (const t of tokens) {
    if (/\d/.test(t) || t.length >= 5) required.push(t)
    else optional.push(t)
  }
  return { required: required.length > 0 ? required : tokens, optional }
}

export function scoreListing(part: Part, listing: RawListing): number {
  const title = normalise(listing.title)
  const titleTokens = new Set(title.split(' '))

  for (const term of [...ACCESSORY_TERMS, ...BUNDLE_TERMS]) {
    if (title.includes(normalise(term))) return 0
  }

  // An exact MPN in the title is as certain as this gets.
  const mpnNorm = normaliseMpn(part.mpn)
  const titleNorm = normaliseMpn(listing.title)
  let score: number
  if (mpnNorm.length >= 6 && titleNorm.includes(mpnNorm)) {
    score = 0.95
  } else {
    const { required, optional } = identifyingTokens(part.model)
    // Whole-token comparison only. Substring matching lets a "5-pack" part
    // match a 3-pack whose title merely contains a 5 somewhere, and lets
    // "Ryzen 9" match any title containing a 9950X3D.
    const hitRequired = required.filter((t) => titleTokens.has(t)).length
    // Every model number must appear; a 5070 is not a 5070 Ti.
    if (hitRequired < required.length) return 0

    const hitOptional = optional.filter((t) => titleTokens.has(t)).length
    const optionalRatio = optional.length > 0 ? hitOptional / optional.length : 1
    // Capped below the MPN route so an exact part-number hit always outranks a
    // token match on a near-identical variant.
    score = 0.62 + 0.26 * optionalRatio
  }

  if (titleTokens.has(normalise(part.brand))) score += 0.05
  for (const term of CONDITION_TERMS) {
    if (title.includes(normalise(term))) score -= 0.35
  }
  if (!listing.inStock) score -= 0.05

  return Math.max(0, Math.min(1, score))
}

export interface Match {
  listing: RawListing
  score: number
}

/** Best listing above the threshold, or null when nothing is convincing. */
export function bestMatch(part: Part, listings: RawListing[]): Match | null {
  let best: Match | null = null
  for (const listing of listings) {
    if (!Number.isFinite(listing.price) || listing.price <= 0) continue
    const score = scoreListing(part, listing)
    if (score < MATCH_THRESHOLD) continue
    // Prefer confidence first, then the cheaper of equally confident listings.
    if (!best || score > best.score + 0.02 || (Math.abs(score - best.score) <= 0.02 && listing.price < best.listing.price)) {
      best = { listing, score }
    }
  }
  return best
}

/** Search strings to try, most precise first. */
export function searchQueries(part: Part): string[] {
  const queries = [part.mpn, `${part.brand} ${part.model}`]
  if (part.searchTerms) queries.push(...part.searchTerms)
  return [...new Set(queries.filter((q) => q && q.trim().length > 2))]
}
