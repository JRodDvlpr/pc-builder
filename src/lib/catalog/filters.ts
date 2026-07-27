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
  PcCase,
  Psu,
  Storage,
} from './types'

/**
 * A filter facet. `get` returns the value(s) a part contributes; the picker
 * derives the option list and live counts from whatever the catalog contains,
 * so adding parts never means updating filter definitions.
 */
export interface Facet {
  key: string
  label: string
  get: (part: Part) => string | string[] | null
}

const BRAND: Facet = { key: 'brand', label: 'Brand', get: (p) => p.brand }

export const FACETS: Record<Category, Facet[]> = {
  cpu: [
    BRAND,
    { key: 'socket', label: 'Socket', get: (p) => (p as Cpu).socket },
    {
      key: 'cores',
      label: 'Core count',
      get: (p) => {
        const c = (p as Cpu).cores
        if (c <= 4) return '4 or fewer'
        if (c <= 8) return '6–8'
        if (c <= 16) return '10–16'
        return '20+'
      },
    },
    { key: 'igpu', label: 'Integrated graphics', get: (p) => ((p as Cpu).integratedGraphics ? 'Yes' : 'No') },
  ],
  cooler: [
    BRAND,
    { key: 'type', label: 'Type', get: (p) => ((p as Cooler).type === 'aio' ? 'Liquid (AIO)' : 'Air') },
    {
      key: 'radiator',
      label: 'Radiator size',
      get: (p) => ((p as Cooler).radiatorMm ? `${(p as Cooler).radiatorMm} mm` : null),
    },
    { key: 'socket', label: 'Socket support', get: (p) => (p as Cooler).socketsSupported },
    { key: 'rgb', label: 'Lighting', get: (p) => ((p as Cooler).rgb ? 'RGB' : 'None') },
  ],
  motherboard: [
    BRAND,
    { key: 'socket', label: 'Socket', get: (p) => (p as Motherboard).socket },
    { key: 'chipset', label: 'Chipset', get: (p) => (p as Motherboard).chipset },
    { key: 'ff', label: 'Form factor', get: (p) => (p as Motherboard).formFactor },
    { key: 'memtype', label: 'Memory type', get: (p) => (p as Motherboard).memoryType },
    { key: 'wifi', label: 'Wi-Fi', get: (p) => ((p as Motherboard).wifi ? 'Built in' : 'None') },
  ],
  memory: [
    BRAND,
    { key: 'type', label: 'Type', get: (p) => (p as Memory).type },
    {
      key: 'total',
      label: 'Total capacity',
      get: (p) => `${(p as Memory).moduleCount * (p as Memory).moduleCapacityGb} GB`,
    },
    { key: 'speed', label: 'Speed', get: (p) => `${(p as Memory).type}-${(p as Memory).speed}` },
    { key: 'modules', label: 'Modules', get: (p) => `${(p as Memory).moduleCount}` },
    { key: 'rgb', label: 'Lighting', get: (p) => ((p as Memory).rgb ? 'RGB' : 'None') },
  ],
  storage: [
    BRAND,
    {
      key: 'type',
      label: 'Type',
      get: (p) => {
        const s = p as Storage
        return s.formFactor === '3.5' ? 'Hard drive' : s.interface === 'NVMe' ? 'NVMe SSD' : 'SATA SSD'
      },
    },
    { key: 'cap', label: 'Capacity', get: (p) => {
      const gb = (p as Storage).capacityGb
      return gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`
    } },
    { key: 'ff', label: 'Form factor', get: (p) => {
      const f = (p as Storage).formFactor
      return f === 'M.2-2280' ? 'M.2 2280' : `${f}"`
    } },
    { key: 'gen', label: 'PCIe generation', get: (p) => {
      const g = (p as Storage).pcieVersion
      return g ? `PCIe ${g}.0` : null
    } },
  ],
  gpu: [
    BRAND,
    { key: 'chipset', label: 'Chipset', get: (p) => (p as Gpu).chipset },
    { key: 'vram', label: 'VRAM', get: (p) => `${(p as Gpu).vramGb} GB` },
    {
      key: 'len',
      label: 'Length',
      get: (p) => {
        const l = (p as Gpu).lengthMm
        if (l <= 250) return 'Under 250 mm'
        if (l <= 320) return '250–320 mm'
        return 'Over 320 mm'
      },
    },
    { key: 'slots', label: 'Slot width', get: (p) => `${(p as Gpu).slotWidth} slot` },
  ],
  case: [
    BRAND,
    { key: 'type', label: 'Case size', get: (p) => (p as PcCase).caseType },
    { key: 'mobo', label: 'Motherboard support', get: (p) => (p as PcCase).motherboardSupport },
    { key: 'panel', label: 'Side panel', get: (p) => (p as PcCase).sidePanel },
    {
      key: 'rad',
      label: 'Radiator support',
      get: (p) => {
        const sizes = [...new Set(Object.values((p as PcCase).radiatorSupport).flat())]
        return sizes.map((s) => `${s} mm`)
      },
    },
  ],
  psu: [
    BRAND,
    {
      key: 'w',
      label: 'Wattage',
      get: (p) => {
        const w = (p as Psu).wattage
        if (w < 650) return 'Under 650 W'
        if (w <= 850) return '650–850 W'
        if (w <= 1000) return '1000 W'
        return 'Over 1000 W'
      },
    },
    { key: 'eff', label: 'Efficiency', get: (p) => (p as Psu).efficiency },
    { key: 'ff', label: 'Form factor', get: (p) => (p as Psu).formFactor },
    { key: 'mod', label: 'Modular', get: (p) => ({ full: 'Full', semi: 'Semi', none: 'Non-modular' })[(p as Psu).modular] },
    { key: 'atx3', label: 'ATX 3.x', get: (p) => ((p as Psu).atx3 ? 'Yes' : 'No') },
  ],
  fan: [
    BRAND,
    { key: 'size', label: 'Size', get: (p) => `${(p as Fan).sizeMm} mm` },
    { key: 'qty', label: 'Pack size', get: (p) => `${(p as Fan).quantity} pack` },
    { key: 'rgb', label: 'Lighting', get: (p) => ((p as Fan).rgb ? 'RGB' : 'None') },
  ],
  monitor: [
    BRAND,
    { key: 'res', label: 'Resolution', get: (p) => (p as Monitor).resolution },
    { key: 'size', label: 'Screen size', get: (p) => `${(p as Monitor).sizeIn}"` },
    {
      key: 'hz',
      label: 'Refresh rate',
      get: (p) => {
        const hz = (p as Monitor).refreshHz
        if (hz <= 75) return 'Up to 75 Hz'
        if (hz <= 165) return '100–165 Hz'
        if (hz <= 240) return '180–240 Hz'
        return 'Over 240 Hz'
      },
    },
    { key: 'panel', label: 'Panel type', get: (p) => (p as Monitor).panelType },
    { key: 'curved', label: 'Curvature', get: (p) => ((p as Monitor).curved ? 'Curved' : 'Flat') },
  ],
}

export type FilterState = Record<string, Set<string>>

/** Option list with the count of parts that would remain if it were selected. */
export function facetOptions(parts: Part[], facet: Facet): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const part of parts) {
    const raw = facet.get(part)
    if (raw === null) continue
    for (const v of Array.isArray(raw) ? raw : [raw]) {
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => collate(a.value, b.value))
}

/** Numeric-aware sort so "1000 W" lands after "650–850 W", not before it. */
function collate(a: string, b: string): number {
  const na = Number.parseFloat(a)
  const nb = Number.parseFloat(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  return a.localeCompare(b)
}

export function applyFilters(parts: Part[], category: Category, filters: FilterState): Part[] {
  const active = FACETS[category].filter((f) => (filters[f.key]?.size ?? 0) > 0)
  if (active.length === 0) return parts
  return parts.filter((part) =>
    active.every((facet) => {
      const raw = facet.get(part)
      if (raw === null) return false
      const values = Array.isArray(raw) ? raw : [raw]
      return values.some((v) => filters[facet.key].has(v))
    }),
  )
}

export function searchParts(parts: Part[], query: string): Part[] {
  const q = query.trim().toLowerCase()
  if (!q) return parts
  const terms = q.split(/\s+/)
  return parts.filter((p) => {
    const haystack = `${p.brand} ${p.model} ${p.mpn}`.toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
}
