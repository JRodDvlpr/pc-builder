import caseData from '../../../data/catalog/case.json'
import coolerData from '../../../data/catalog/cooler.json'
import cpuData from '../../../data/catalog/cpu.json'
import fanData from '../../../data/catalog/fan.json'
import gpuData from '../../../data/catalog/gpu.json'
import memoryData from '../../../data/catalog/memory.json'
import motherboardData from '../../../data/catalog/motherboard.json'
import psuData from '../../../data/catalog/psu.json'
import storageData from '../../../data/catalog/storage.json'
import monitorData from '../../../data/catalog/monitor.json'

import { CATEGORIES } from './types'
import type {
  Category,
  Cooler,
  Cpu,
  Fan,
  Gpu,
  Memory,
  Monitor,
  Motherboard,
  Part,
  PartByCategory,
  PcCase,
  Psu,
  Storage,
} from './types'

/**
 * The catalog is committed JSON loaded into memory at module scope.
 *
 * At ~500 parts this is small enough to ship to the client whole, which is the
 * point: filtering and sorting in the part picker are pure array operations
 * with no network round-trip, so the UI stays instant. Prices are the only
 * thing fetched at runtime.
 */
export const CATALOG: { [K in Category]: PartByCategory[K][] } = {
  cpu: cpuData as Cpu[],
  cooler: coolerData as Cooler[],
  motherboard: motherboardData as Motherboard[],
  memory: memoryData as Memory[],
  storage: storageData as Storage[],
  gpu: gpuData as Gpu[],
  case: caseData as PcCase[],
  psu: psuData as Psu[],
  fan: fanData as Fan[],
  monitor: monitorData as Monitor[],
}

export const ALL_PARTS: Part[] = CATEGORIES.flatMap((c) => CATALOG[c] as Part[])

const BY_ID = new Map<string, Part>(ALL_PARTS.map((p) => [p.id, p]))

if (BY_ID.size !== ALL_PARTS.length) {
  const seen = new Set<string>()
  const dupes = ALL_PARTS.filter((p) => (seen.has(p.id) ? true : (seen.add(p.id), false)))
  throw new Error(`Duplicate catalog part ids: ${dupes.map((d) => d.id).join(', ')}`)
}

export function getPart(id: string): Part | undefined {
  return BY_ID.get(id)
}

export function getParts(ids: string[]): Part[] {
  return ids.map(getPart).filter((p): p is Part => p !== undefined)
}

export function partsIn<K extends Category>(category: K): PartByCategory[K][] {
  return CATALOG[category]
}

/** Distinct brands in a category, sorted — used to build filter facets. */
export function brandsIn(category: Category): string[] {
  return [...new Set(CATALOG[category].map((p) => p.brand))].sort()
}

export const CATALOG_SIZE = ALL_PARTS.length

export * from './types'
export * from './platforms'
