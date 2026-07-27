import { getPart } from '../catalog'
import { emptyBuild, isMulti, type BuildSelection } from './types'

/**
 * Builds serialise to a single `b` query parameter, e.g.
 *   ?b=cpu-9800x3d,mb-b850-tomahawk,mem-tz5-6000c30-32,ssd-990pro-2tb*2
 *
 * Category is not stored — every part id resolves to its own category through
 * the catalog, so the URL stays short and there is no way for the two to
 * disagree. A `*n` suffix carries quantity.
 */
export function encodeBuild(selection: BuildSelection): string {
  const tokens: string[] = []
  for (const items of Object.values(selection)) {
    for (const item of items) {
      tokens.push(item.qty > 1 ? `${item.partId}*${item.qty}` : item.partId)
    }
  }
  return tokens.join(',')
}

export function decodeBuild(encoded: string | null | undefined): BuildSelection {
  const selection = emptyBuild()
  if (!encoded) return selection

  for (const token of encoded.split(',')) {
    if (!token) continue
    const [partId, qtyRaw] = token.split('*')
    const part = getPart(partId)
    if (!part) continue // dropped from the catalog since the link was made

    const qty = Math.min(Math.max(Number.parseInt(qtyRaw ?? '1', 10) || 1, 1), 99)
    const bucket = selection[part.category]

    if (!isMulti(part.category)) {
      // Single-select: a malformed link with two CPUs keeps the first.
      if (bucket.length > 0) continue
      bucket.push({ partId, qty: 1 })
    } else {
      const existing = bucket.find((i) => i.partId === partId)
      if (existing) existing.qty = Math.min(existing.qty + qty, 99)
      else bucket.push({ partId, qty })
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
