import { CATEGORIES, type Category } from '../catalog/types'

export interface BuildItem {
  partId: string
  qty: number
  /**
   * Already in the user's possession, so it costs nothing to complete the build.
   *
   * The part stays in the build and still counts for compatibility and power —
   * a drive you already own still occupies a SATA port, and a PSU you already
   * own still has to be big enough. It is only the money that changes.
   */
  owned?: boolean
  /**
   * A price the user set by hand, per unit, replacing whatever was scraped.
   *
   * Someone who already owns a part knows what they paid better than any
   * retailer does, and someone who found a better deal wants their own number in
   * the total rather than ours.
   */
  customPrice?: number
}

/**
 * The user's selection, stored as ids rather than part objects so it serialises
 * straight into a URL and survives a catalog update.
 *
 * Single-select categories (CPU, motherboard, case, PSU, GPU, cooler) hold at
 * most one entry; the rest may hold several.
 */
export type BuildSelection = Record<Category, BuildItem[]>

export function emptyBuild(): BuildSelection {
  const selection = {} as BuildSelection
  for (const category of CATEGORIES) selection[category] = []
  return selection
}

/** Categories that accept more than one distinct part. */
export const MULTI_CATEGORIES: Category[] = ['memory', 'storage', 'fan', 'monitor']

export function isMulti(category: Category): boolean {
  return MULTI_CATEGORIES.includes(category)
}
