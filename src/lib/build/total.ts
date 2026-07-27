import { getPart } from '../catalog'
import { CATEGORIES, type Category, type Part } from '../catalog/types'
import type { PriceInfo } from '../scrape/types'
import type { BuildSelection } from './types'

export interface LineItem {
  category: Category
  part: Part
  qty: number
  unitPrice: number
  lineTotal: number
  /** Undefined until the price API has answered for this part. */
  priceInfo?: PriceInfo
}

/**
 * Flatten a selection into priced line items, in category display order.
 *
 * Falls back to the committed seed price whenever a live or cached offer is
 * missing, so the running total is always a real number — a scraper outage
 * shows a stale badge, never a blank.
 */
export function buildLines(
  selection: BuildSelection,
  prices: Record<string, PriceInfo>,
): LineItem[] {
  const lines: LineItem[] = []
  for (const category of CATEGORIES) {
    for (const item of selection[category]) {
      const part = getPart(item.partId)
      if (!part) continue
      const priceInfo = prices[item.partId]
      const unitPrice = priceInfo?.price ?? part.seedPrice
      lines.push({
        category,
        part,
        qty: item.qty,
        unitPrice,
        lineTotal: unitPrice * item.qty,
        priceInfo,
      })
    }
  }
  return lines
}

export function buildTotal(lines: LineItem[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotal, 0)
}

export function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatRelative(epochMs: number | null): string {
  if (!epochMs) return ''
  const mins = Math.floor((Date.now() - epochMs) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
