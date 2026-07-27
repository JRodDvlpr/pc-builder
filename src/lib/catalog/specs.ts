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

export interface SpecColumn {
  key: string
  label: string
  /** Right-align numeric columns. */
  numeric?: boolean
  value: (part: Part) => string
  /** Raw value for sorting; falls back to the display string. */
  sortValue?: (part: Part) => number | string
}

const capacity = (gb: number) => (gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`)

/**
 * The columns each category shows in the picker.
 *
 * Deliberately short — three or four numbers people actually choose on, rather
 * than the twenty-column spec dump that makes PCPartPicker's tables scroll
 * sideways on anything narrower than a desktop.
 */
export const SPEC_COLUMNS: Record<Category, SpecColumn[]> = {
  cpu: [
    { key: 'cores', label: 'Cores', numeric: true, value: (p) => `${(p as Cpu).cores}`, sortValue: (p) => (p as Cpu).cores },
    { key: 'boost', label: 'Boost', numeric: true, value: (p) => `${(p as Cpu).boostClock} GHz`, sortValue: (p) => (p as Cpu).boostClock },
    { key: 'tdp', label: 'TDP', numeric: true, value: (p) => `${(p as Cpu).tdp} W`, sortValue: (p) => (p as Cpu).tdp },
    { key: 'socket', label: 'Socket', value: (p) => (p as Cpu).socket },
    { key: 'igpu', label: 'Graphics', value: (p) => ((p as Cpu).integratedGraphics ? 'Integrated' : 'None') },
  ],
  cooler: [
    { key: 'type', label: 'Type', value: (p) => ((p as Cooler).type === 'aio' ? 'Liquid' : 'Air') },
    {
      key: 'size',
      label: 'Size',
      numeric: true,
      value: (p) => {
        const c = p as Cooler
        return c.type === 'aio' ? `${c.radiatorMm} mm rad` : `${c.heightMm} mm tall`
      },
      sortValue: (p) => (p as Cooler).radiatorMm ?? (p as Cooler).heightMm ?? 0,
    },
    { key: 'tdp', label: 'Rated', numeric: true, value: (p) => `${(p as Cooler).tdpRating} W`, sortValue: (p) => (p as Cooler).tdpRating },
    { key: 'noise', label: 'Noise', numeric: true, value: (p) => ((p as Cooler).noiseDb ? `${(p as Cooler).noiseDb} dBA` : '—'), sortValue: (p) => (p as Cooler).noiseDb ?? 999 },
  ],
  motherboard: [
    { key: 'socket', label: 'Socket', value: (p) => (p as Motherboard).socket },
    { key: 'chipset', label: 'Chipset', value: (p) => (p as Motherboard).chipset },
    { key: 'ff', label: 'Form', value: (p) => (p as Motherboard).formFactor },
    { key: 'mem', label: 'Memory', value: (p) => `${(p as Motherboard).memorySlots}× ${(p as Motherboard).memoryType}`, sortValue: (p) => (p as Motherboard).memorySlots },
    { key: 'm2', label: 'M.2', numeric: true, value: (p) => `${(p as Motherboard).m2Slots}`, sortValue: (p) => (p as Motherboard).m2Slots },
  ],
  memory: [
    { key: 'kit', label: 'Kit', value: (p) => `${(p as Memory).moduleCount}× ${(p as Memory).moduleCapacityGb} GB`, sortValue: (p) => (p as Memory).moduleCount * (p as Memory).moduleCapacityGb },
    { key: 'type', label: 'Type', value: (p) => (p as Memory).type },
    { key: 'speed', label: 'Speed', numeric: true, value: (p) => `${(p as Memory).speed}`, sortValue: (p) => (p as Memory).speed },
    { key: 'cl', label: 'CAS', numeric: true, value: (p) => `CL${(p as Memory).casLatency}`, sortValue: (p) => (p as Memory).casLatency },
    { key: 'volt', label: 'Voltage', numeric: true, value: (p) => `${(p as Memory).voltage} V`, sortValue: (p) => (p as Memory).voltage },
  ],
  storage: [
    { key: 'cap', label: 'Capacity', numeric: true, value: (p) => capacity((p as Storage).capacityGb), sortValue: (p) => (p as Storage).capacityGb },
    { key: 'type', label: 'Type', value: (p) => ((p as Storage).formFactor === '3.5' ? 'HDD' : (p as Storage).interface === 'NVMe' ? 'NVMe SSD' : 'SATA SSD') },
    { key: 'ff', label: 'Form', value: (p) => ((p as Storage).formFactor === 'M.2-2280' ? 'M.2 2280' : `${(p as Storage).formFactor}"`) },
    { key: 'read', label: 'Read', numeric: true, value: (p) => ((p as Storage).readMbps ? `${(p as Storage).readMbps} MB/s` : '—'), sortValue: (p) => (p as Storage).readMbps ?? 0 },
    { key: 'write', label: 'Write', numeric: true, value: (p) => ((p as Storage).writeMbps ? `${(p as Storage).writeMbps} MB/s` : '—'), sortValue: (p) => (p as Storage).writeMbps ?? 0 },
  ],
  gpu: [
    { key: 'chipset', label: 'Chipset', value: (p) => (p as Gpu).chipset },
    { key: 'vram', label: 'VRAM', numeric: true, value: (p) => `${(p as Gpu).vramGb} GB`, sortValue: (p) => (p as Gpu).vramGb },
    { key: 'len', label: 'Length', numeric: true, value: (p) => `${(p as Gpu).lengthMm} mm`, sortValue: (p) => (p as Gpu).lengthMm },
    { key: 'tdp', label: 'TDP', numeric: true, value: (p) => `${(p as Gpu).tdp} W`, sortValue: (p) => (p as Gpu).tdp },
  ],
  case: [
    { key: 'type', label: 'Type', value: (p) => (p as PcCase).caseType },
    { key: 'mobo', label: 'Boards', value: (p) => (p as PcCase).motherboardSupport.join(', ') },
    { key: 'gpu', label: 'Max GPU', numeric: true, value: (p) => `${(p as PcCase).maxGpuLengthMm} mm`, sortValue: (p) => (p as PcCase).maxGpuLengthMm },
    { key: 'cooler', label: 'Cooler', numeric: true, value: (p) => `${(p as PcCase).maxCoolerHeightMm} mm`, sortValue: (p) => (p as PcCase).maxCoolerHeightMm },
    { key: 'fans', label: 'Fans', numeric: true, value: (p) => `${(p as PcCase).includedFans}`, sortValue: (p) => (p as PcCase).includedFans },
    { key: 'bays', label: 'HDD bays', numeric: true, value: (p) => `${(p as PcCase).bays35}`, sortValue: (p) => (p as PcCase).bays35 },
  ],
  psu: [
    { key: 'w', label: 'Wattage', numeric: true, value: (p) => `${(p as Psu).wattage} W`, sortValue: (p) => (p as Psu).wattage },
    { key: 'eff', label: 'Efficiency', value: (p) => (p as Psu).efficiency },
    { key: 'ff', label: 'Form', value: (p) => (p as Psu).formFactor },
    { key: 'mod', label: 'Modular', value: (p) => ({ full: 'Full', semi: 'Semi', none: 'No' })[(p as Psu).modular] },
    { key: 'atx3', label: 'ATX 3.x', value: (p) => ((p as Psu).atx3 ? 'Yes' : 'No') },
    { key: 'len', label: 'Depth', numeric: true, value: (p) => `${(p as Psu).lengthMm} mm`, sortValue: (p) => (p as Psu).lengthMm },
  ],
  fan: [
    { key: 'size', label: 'Size', numeric: true, value: (p) => `${(p as Fan).sizeMm} mm`, sortValue: (p) => (p as Fan).sizeMm },
    { key: 'qty', label: 'Pack', numeric: true, value: (p) => `${(p as Fan).quantity}×`, sortValue: (p) => (p as Fan).quantity },
    { key: 'cfm', label: 'Airflow', numeric: true, value: (p) => `${(p as Fan).cfm} CFM`, sortValue: (p) => (p as Fan).cfm },
    { key: 'noise', label: 'Noise', numeric: true, value: (p) => `${(p as Fan).noiseDb} dBA`, sortValue: (p) => (p as Fan).noiseDb },
  ],
  monitor: [
    { key: 'size', label: 'Size', numeric: true, value: (p) => `${(p as Monitor).sizeIn}"`, sortValue: (p) => (p as Monitor).sizeIn },
    { key: 'res', label: 'Resolution', value: (p) => (p as Monitor).resolution },
    { key: 'hz', label: 'Refresh', numeric: true, value: (p) => `${(p as Monitor).refreshHz} Hz`, sortValue: (p) => (p as Monitor).refreshHz },
    { key: 'panel', label: 'Panel', value: (p) => (p as Monitor).panelType },
    { key: 'sync', label: 'Sync', value: (p) => (p as Monitor).adaptiveSync },
  ],
}

/** One-line spec summary shown under a selected part in the build table. */
export function specSummary(part: Part): string {
  return SPEC_COLUMNS[part.category]
    .slice(0, 4)
    .map((c) => c.value(part))
    .filter((v) => v && v !== '—')
    .join(' · ')
}
