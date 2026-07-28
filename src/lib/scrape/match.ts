import { ALL_PARTS } from '../catalog'
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

/** A decisive rejection, carrying the reason for the diagnostics. */
function reject(reason: string): ScoreExplanation {
  return { score: 0, reason }
}

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
  'power cord',
  'power cable',
  'ac adapter',
  'ac dc adapter',
  'remote control',
  'replacement for',
  'replaced remote',
  'compatible with',
]

/** Accessory terms a power supply's own listing legitimately contains. */
const CABLE_TERMS = new Set([
  'cable',
  'power cord',
  'power cable',
  'extension cable',
  'adapter cable',
])
const EMPTY: ReadonlySet<string> = new Set()

/**
 * "…for <brand>" phrasing, which marks a third-party accessory rather than the
 * product itself: "AC Power Cord **for Dell** UltraSharp U4025QW" priced a
 * $1,599 monitor at $8.88, because the cheapest offer wins and nothing rejected
 * it.
 *
 * This used to be three hardcoded entries — asus, msi, gigabyte — which missed
 * every other manufacturer in the catalog. Deriving the alternation from the
 * catalog's own brands keeps it complete as parts are added, and costs one
 * regex build at module load.
 *
 * Platform vendors are deliberately excluded. "CPU Cooler **for AMD** AM5" and
 * "Socket Support **for Intel** LGA 1851" are compatibility statements on the
 * real product, not accessory markers — including them rejected 14 legitimate
 * cooler listings. Peripheral and component brands do not appear that way:
 * nothing says "for Dell" unless it is made to plug into one.
 */
const PLATFORM_VENDORS = new Set(['amd', 'intel', 'nvidia'])

function accessoryForBrandPattern(brands: Iterable<string>): RegExp {
  const alternatives = [...new Set([...brands].map((b) => normalise(b)))]
    .filter((b) => b && !PLATFORM_VENDORS.has(b))
    .sort((a, b) => b.length - a.length) // longest first: "lian li" before "lian"
    .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // "fit for" and "fits for" both occur in the wild; so does a bare "for".
  return new RegExp(`\\b(?:fits? for|compatible with|for)\\s+(?:${alternatives.join('|')})\\b`)
}

/**
 * Brands retailers routinely write differently from the catalog.
 *
 * Requiring an exact brand match rejected 24 legitimate listings: Western
 * Digital sells as "WD_BLACK", Dell's gaming monitors as "Alienware", TEAMGROUP
 * as "Team Group". Spelling variants that merely differ in spacing ("Lian Li" vs
 * "LIANLI") are handled by comparing the squashed form, so only genuine
 * alternate names need to live here.
 */
const BRAND_ALIASES: Record<string, string[]> = {
  'western digital': ['wd', 'wdblack', 'wdred', 'sandisk'],
  dell: ['alienware'],
  teamgroup: ['team', 'teamgroup', 'tforce'],
  'g skill': ['gskill'],
  'be quiet': ['bequiet'],
  // Product lines retailers use in place of the manufacturer: Newegg lists the
  // MSI MAG Z890 Tomahawk as simply "MAG Z890 Tomahawk WiFi II".
  msi: ['mag', 'mpg', 'meg'],
  gigabyte: ['aorus'],
  asus: ['rog', 'tuf', 'proart'],
}

/**
 * Whether the listing names the part's manufacturer.
 *
 * Compared on the space-squashed form so "Lian Li" matches "LIANLI", plus the
 * alias table above for names that are genuinely different words.
 */
function mentionsBrand(title: string, titleTokens: string[], brand: string): boolean {
  const normalised = normalise(brand)
  const squashed = normalised.replace(/ /g, '')
  if (containsTokenRun(titleTokens, normalised.split(' ').filter(Boolean))) return true
  if (squashed.length >= 4 && title.replace(/ /g, '').includes(squashed)) return true
  return (BRAND_ALIASES[normalised] ?? []).some((a) => titleTokens.includes(a))
}

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
  // Marketing umbrellas retailers drop at will: "msi Gaming RTX 5070 12G Ventus
  // 2X OC" is the same card as "MSI Ventus GeForce RTX 5070", and requiring the
  // word cost us the cheaper of the two listings.
  'geforce',
  'radeon',
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

/** Built once from the catalog's own brands, so it never drifts out of sync. */
const ACCESSORY_FOR_BRAND = accessoryForBrandPattern(ALL_PARTS.map((p) => p.brand))

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

/**
 * Whether the listing names a DDR generation that is not the part's.
 *
 * Same shape as `contradictsCas`, for the same reason — absence tells us
 * nothing, contradiction is decisive. This one has teeth because DDR4 and DDR5
 * boards of the same model name are genuinely different products at genuinely
 * different prices: our DDR5 B760 Tomahawk was matching the DDR4 board at
 * $651.92 when the correct listing was $139.99.
 */
function contradictsMemoryType(titleTokens: string[], part: Part): boolean {
  const declared =
    part.category === 'motherboard'
      ? [part.memoryType]
      : part.category === 'memory'
        ? [part.type]
        : []
  if (declared.length === 0) return false
  const ours = new Set(declared.map((d) => d.toLowerCase()))
  const stated = titleTokens.filter((t) => t === 'ddr4' || t === 'ddr5')
  if (stated.length === 0) return false
  return !stated.some((t) => ours.has(t))
}

/**
 * Whether the part number is distinctive enough to be trusted on its own.
 *
 * An exact part-number hit short-circuits to near-certainty, so a part number
 * that is really just a word costs us dearly: the Antec C8's MPN is "C8 BLACK",
 * which tokenises to `c8 · black` and matched **"Matchbox 2020 Corvete C8,
 * Black"** — a toy car — at 0.95. Stripping punctuation left "c8black", seven
 * characters, which sailed past the old length check.
 *
 * A real part number has at least one substantial token mixing letters and
 * digits: `u4025qw`, `ct1000mx500ssd1`, `kf560c36bbek2`. "C8 BLACK" has none, so
 * it falls back to ordinary token matching instead of being taken as proof.
 */
function isDistinctiveMpn(mpn: string): boolean {
  return normalise(mpn)
    .split(' ')
    .some((t) => t.length >= 5 && /\d/.test(t) && /[a-z]/.test(t))
}

export interface ScoreExplanation {
  score: number
  /** Why the listing was thrown out, when it was. */
  reason?: string
}

/**
 * Score a listing and say why, so a rejection can be read rather than guessed at.
 *
 * `scoreListing` is a thin wrapper over this rather than a parallel
 * implementation: during this audit a hand-written approximation of the rules
 * drifted from the real ones and produced a misleading diagnosis, which is
 * exactly the failure this shape prevents.
 */
export function explainListing(part: Part, listing: RawListing): ScoreExplanation {
  const title = normalise(listing.title)
  const titleTokenList = title.split(' ')
  const titleTokens = new Set(titleTokenList)

  for (const term of BUNDLE_TERMS) {
    if (title.includes(normalise(term))) return reject(`bundle term "${term}"`)
  }

  /**
   * A power supply's listing is largely *about* its cables, so the cable terms
   * cannot disqualify one: "NZXT C850 … Full-modular Power Supply, US Power
   * Cord" is a $289 PSU, not an $8 cord. Every other category keeps the strict
   * test, because there the same words really do mean a different product —
   * "Lancool 216 Dust Filter Kit" is a filter no matter where in the title the
   * words fall.
   */
  const exempt = part.category === 'psu' ? CABLE_TERMS : EMPTY
  for (const term of ACCESSORY_TERMS) {
    if (exempt.has(term)) continue
    if (title.includes(normalise(term))) return reject(`accessory term "${term}"`)
  }
  const forBrand = ACCESSORY_FOR_BRAND.exec(title)
  if (forBrand) return reject(`accessory phrasing "${forBrand[0]}"`)

  if (contradictsMemoryType(titleTokenList, part)) return reject('states a different DDR generation')

  /**
   * A missing brand is strong evidence the listing is something else, and used
   * to cost nothing: it was a +0.05 bonus, which is how "Matchbox 2020 Corvete
   * C8, Black" came to be priced as an Antec C8 case.
   *
   * The penalty is large enough that a listing with no brand needs an otherwise
   * perfect token match to survive, but stops short of a hard reject — retailers
   * do sometimes list a product under its bare model name, and rejecting those
   * outright cost real prices during calibration.
   */
  const brandSeen = mentionsBrand(title, titleTokenList, part.brand)

  // An exact MPN in the title is as certain as this gets — provided the part
  // number is distinctive enough to mean anything.
  const mpnTokens = normalise(part.mpn).split(' ').filter(Boolean)
  let score: number
  if (isDistinctiveMpn(part.mpn) && containsTokenRun(titleTokenList, mpnTokens)) {
    score = 0.95
  } else {
    const { required, optional, cas } = identifyingTokens(part.model)
    if (contradictsCas(titleTokenList, cas)) return reject('states a different CAS latency')
    // Whole-token comparison only. Substring matching lets a "5-pack" part
    // match a 3-pack whose title merely contains a 5 somewhere, and lets
    // "Ryzen 9" match any title containing a 9950X3D.
    const missing = required.filter((t) => !titleTokens.has(t))
    // Every model number must appear; a 5070 is not a 5070 Ti.
    if (missing.length > 0) return reject(`missing model token(s): ${missing.join(', ')}`)

    const hitOptional = optional.filter((t) => titleTokens.has(t)).length
    const optionalRatio = optional.length > 0 ? hitOptional / optional.length : 1
    // Capped below the MPN route so an exact part-number hit always outranks a
    // token match on a near-identical variant.
    score = 0.62 + 0.26 * optionalRatio
  }

  score += brandSeen ? 0.05 : -0.3
  const conditions: string[] = []
  for (const term of CONDITION_TERMS) {
    if (title.includes(normalise(term))) {
      score -= 0.35
      conditions.push(term)
    }
  }
  if (!listing.inStock) score -= 0.05

  score = Math.max(0, Math.min(1, score))
  if (score >= MATCH_THRESHOLD) return { score }

  const why: string[] = []
  if (!brandSeen) why.push(`brand "${part.brand}" not named`)
  if (conditions.length > 0) why.push(`condition: ${conditions.join(', ')}`)
  if (!listing.inStock) why.push('out of stock')
  return { score, reason: why.length > 0 ? why.join('; ') : 'weak token overlap' }
}

export function scoreListing(part: Part, listing: RawListing): number {
  return explainListing(part, listing).score
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
