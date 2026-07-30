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
  /** Already owned, so it adds nothing to what the build costs to finish. */
  owned: boolean
  /** The user replaced the market price with their own. */
  custom: boolean
  /** Undefined until the price API has answered for this part. */
  priceInfo?: PriceInfo
}

/**
 * Flatten a selection into priced line items, in category display order.
 *
 * Falls back to the committed seed price whenever a live or cached offer is
 * missing, so the running total is always a real number — a scraper outage
 * shows a stale badge, never a blank.
 *
 * A hand-entered price wins over every scraped one. The user knows what they
 * paid, or what they found it for, better than we do.
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
      const custom = item.customPrice !== undefined
      const unitPrice = item.customPrice ?? priceInfo?.price ?? part.seedPrice
      lines.push({
        category,
        part,
        qty: item.qty,
        unitPrice,
        lineTotal: unitPrice * item.qty,
        owned: item.owned === true,
        custom,
        priceInfo,
      })
    }
  }
  return lines
}

/**
 * What the build still costs to finish.
 *
 * Parts the user already owns are excluded: the number that matters when you are
 * standing at a checkout is what you have left to buy, not what the machine is
 * worth. `ownedTotal` covers the other half for anyone who wants it.
 */
export function buildTotal(lines: LineItem[]): number {
  return lines.reduce((sum, l) => (l.owned ? sum : sum + l.lineTotal), 0)
}

/** Value of the parts already owned, for context beside the purchase total. */
export function ownedTotal(lines: LineItem[]): number {
  return lines.reduce((sum, l) => (l.owned ? sum + l.lineTotal : sum), 0)
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
