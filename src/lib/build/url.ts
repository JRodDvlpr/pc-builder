import { getPart } from '../catalog'
import { emptyBuild, isMulti, type BuildSelection } from './types'

/**
 * Builds serialise to a single `b` query parameter, e.g.
 *   ?b=cpu-9800x3d,mb-b850-tomahawk,mem-tz5-6000c30-32,ssd-990pro-2tb*2
 *
 * Category is not stored — every part id resolves to its own category through
 * the catalog, so the URL stays short and there is no way for the two to
 * disagree.
 *
 * Each token is `id[*qty][$price][!]`: `*n` carries quantity, `$n` a
 * hand-entered unit price, and a trailing `!` marks a part the user already
 * owns. Part ids are lowercase letters, digits and hyphens, so none of the three
 * markers can be confused for part of an id. All three are optional and a plain
 * id still decodes exactly as it always did, which keeps links shared before
 * this existed working.
 */
const TOKEN = /^([a-z0-9-]+?)(?:\*(\d+))?(?:\$(\d+(?:\.\d{1,2})?))?(!)?$/

export function encodeBuild(selection: BuildSelection): string {
  const tokens: string[] = []
  for (const items of Object.values(selection)) {
    for (const item of items) {
      let token = item.partId
      if (item.qty > 1) token += `*${item.qty}`
      // Trailing zeroes would survive the round trip and look like noise.
      if (item.customPrice !== undefined) token += `$${Number(item.customPrice.toFixed(2))}`
      if (item.owned) token += '!'
      tokens.push(token)
    }
  }
  return tokens.join(',')
}

export function decodeBuild(encoded: string | null | undefined): BuildSelection {
  const selection = emptyBuild()
  if (!encoded) return selection

  for (const token of encoded.split(',')) {
    if (!token) continue
    const match = TOKEN.exec(token)
    if (!match) continue
    const [, partId, qtyRaw, priceRaw, ownedRaw] = match
    const part = getPart(partId)
    if (!part) continue // dropped from the catalog since the link was made

    const qty = Math.min(Math.max(Number.parseInt(qtyRaw ?? '1', 10) || 1, 1), 99)
    const owned = ownedRaw ? true : undefined
    // A hand-entered price comes from a URL anyone can edit, so it is clamped to
    // something that cannot wreck the total or render as nonsense.
    const parsed = priceRaw === undefined ? Number.NaN : Number.parseFloat(priceRaw)
    const customPrice =
      Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000 ? parsed : undefined

    const bucket = selection[part.category]

    if (!isMulti(part.category)) {
      // Single-select: a malformed link with two CPUs keeps the first.
      if (bucket.length > 0) continue
      bucket.push({ partId, qty: 1, ...(owned && { owned }), ...(customPrice !== undefined && { customPrice }) })
    } else {
      const existing = bucket.find((i) => i.partId === partId)
      if (existing) existing.qty = Math.min(existing.qty + qty, 99)
      else bucket.push({ partId, qty, ...(owned && { owned }), ...(customPrice !== undefined && { customPrice }) })
    }
  }
  return selection
}

export function isEmptyBuild(selection: BuildSelection): boolean {
  return Object.values(selection).every((items) => items.length === 0)
}

export function countParts(selection: BuildSelection): number {
  return Object.values(selection).reduce((n, items) => n + items.reduce((m, i) => m + i.qty, 0), 0)
}
