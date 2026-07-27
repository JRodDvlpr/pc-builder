import { CATEGORIES, type Category } from '../catalog/types'

export interface BuildItem {
  partId: string
  qty: number
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
