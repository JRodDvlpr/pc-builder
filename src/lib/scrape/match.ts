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
  'dust filter',
  'filter kit',
  'screw',
  'thermal pad',
  'mounting kit',
  'replacement fan',
  'extension cable',
  'adapter cable',
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

/**
 * Whether the part number appears in the title as a run of whole tokens.
 *
 * A plain substring test on the punctuation-stripped strings matched
 * "LANCOOL 216" inside "LANCOOL 216RX" and priced a different case. Checking
 * character boundaries cannot fix that, because stripping punctuation is what
 * removed the boundaries in the first place — "lianlilancool216black" has none.
 *
 * Comparing token runs keeps both properties we need: "100-100001084WOF" still
 * matches a title that writes it the same way (both tokenise to
 * `100 · 100001084wof`), while "lancool · 216" no longer matches
 * `lancool · 216rx`, because `216` and `216rx` are different tokens.
 */
function containsTokenRun(titleTokens: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > titleTokens.length) return false
  outer: for (let i = 0; i <= titleTokens.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (titleTokens[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

function tokenise(s: string): string[] {
  return normalise(s)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

/**
 * Parenthetical model-year and revision markers: "(2023)", "(rev 2.0)".
 *
 * These are how the catalog disambiguates a refresh from the model it replaced,
 * but retailers list them inconsistently — Amazon writes "RM750e (2023)" and
 * "CX650" for two products of the same vintage. Treating them as required meant
 * every part carrying one could never match, which is why the PSUs were the
 * worst-covered category. Note this deliberately does not touch other
 * parentheticals: a memory kit's "(2x16GB)" really is identifying.
 */
const YEAR_OR_REV = /\((?:19|20)\d{2}\)|\(\s*rev\.?[^)]*\)/gi

/**
 * A memory kit's CAS latency, as written in a catalog model name: "CL30".
 *
 * Retailers systematically leave this out of the title and encode it in the part
 * number instead — Newegg lists our CL30 kit as "DDR5 6000 (PC5 48000) … Model
 * CMH64GX5M2B6000C30". Requiring it outright meant no DDR5 kit could ever match,
 * which is why memory was the second worst-covered category.
 */
const CAS_TOKEN = /^cl\d+$/

/**
 * Tokens a listing must contain to be considered the same product.
 * Model numbers (tokens with digits) carry the identity, so they are required;
 * short alphabetic tokens are treated as optional flavour. CAS latency is
 * handled separately — see `contradictsCas`.
 */
function identifyingTokens(model: string): {
  required: string[]
  optional: string[]
  cas: string[]
} {
  const aside = model.match(YEAR_OR_REV)?.join(' ') ?? ''
  const tokens = tokenise(model.replace(YEAR_OR_REV, ' '))
  const required: string[] = []
  const cas: string[] = []
  // A year or revision still counts in its favour when a listing does spell it
  // out; it just no longer disqualifies the listings that don't.
  const optional: string[] = tokenise(aside)
  for (const t of tokens) {
    if (CAS_TOKEN.test(t)) {
      cas.push(t)
      optional.push(t)
    } else if (/\d/.test(t) || t.length >= 5) required.push(t)
    else optional.push(t)
  }
  return { required: required.length > 0 ? required : tokens, optional, cas }
}

/**
 * Whether the listing states a CAS latency that is not ours.
 *
 * Absence of evidence is not evidence of mismatch: a title that names no latency
 * at all tells us nothing and must not be rejected, or we lose the entire memory
 * category. A title that names a *different* one is a genuine contradiction and
 * is rejected outright.
 *
 * The residual risk is matching a sibling SKU that differs only in latency bin
 * when neither title spells it out. That is accepted deliberately — such kits
 * price within a percent or two of each other, and an exact part-number hit
 * still outranks them, so the correct SKU wins whenever it is on the page.
 */
function contradictsCas(titleTokens: string[], cas: string[]): boolean {
  if (cas.length === 0) return false
  const stated = titleTokens.filter((t) => CAS_TOKEN.test(t))
  if (stated.length === 0) return false
  return !cas.some((t) => stated.includes(t))
}

export function scoreListing(part: Part, listing: RawListing): number {
  const title = normalise(listing.title)
  const titleTokenList = title.split(' ')
  const titleTokens = new Set(titleTokenList)

  for (const term of [...ACCESSORY_TERMS, ...BUNDLE_TERMS]) {
    if (title.includes(normalise(term))) return 0
  }

  // An exact MPN in the title is as certain as this gets.
  const mpnNorm = normaliseMpn(part.mpn)
  const mpnTokens = normalise(part.mpn).split(' ').filter(Boolean)
  let score: number
  if (mpnNorm.length >= 6 && containsTokenRun(titleTokenList, mpnTokens)) {
    score = 0.95
  } else {
    const { required, optional, cas } = identifyingTokens(part.model)
    if (contradictsCas(titleTokenList, cas)) return 0
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
