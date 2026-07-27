/**
 * Catalog type definitions.
 *
 * Every spec field here exists because a compatibility rule or the power
 * estimator reads it. Cosmetic fields (colour, RGB) are kept only where users
 * filter on them.
 */

export const CATEGORIES = [
  'cpu',
  'cooler',
  'motherboard',
  'memory',
  'storage',
  'gpu',
  'case',
  'psu',
  'fan',
  'monitor',
] as const

export type Category = (typeof CATEGORIES)[number]

export type Socket = 'AM5' | 'AM4' | 'LGA1700' | 'LGA1851' | 'LGA1200'
export type MemoryType = 'DDR4' | 'DDR5'
export type MoboFormFactor = 'E-ATX' | 'ATX' | 'Micro-ATX' | 'Mini-ITX'
export type PsuFormFactor = 'ATX' | 'SFX' | 'SFX-L'
export type CoolerType = 'air' | 'aio'
export type StorageInterface = 'NVMe' | 'SATA'
export type StorageFormFactor = 'M.2-2280' | '2.5' | '3.5'

/** Power-connector shorthand used on both GPUs (required) and PSUs (supplied). */
export interface PowerConnectors {
  /** 6+2-pin PCIe cables. */
  pcie8?: number
  /** 12VHPWR / 12V-2x6 native cables. */
  pcie12vhpwr?: number
  /** CPU EPS cables. */
  eps8?: number
  sata?: number
}

export interface BasePart {
  id: string
  category: Category
  brand: string
  model: string
  /** Manufacturer part number — the scraper's most precise search key. */
  mpn: string
  /** Extra query strings tried when the MPN finds nothing. */
  searchTerms?: string[]
  /** Fallback price used when no live or cached offer is available. */
  seedPrice: number
  releaseYear?: number
}

/**
 * CPU microarchitecture generation. Socket alone is not enough to decide
 * compatibility — an AM5 board with a B650 chipset needs a BIOS-level family
 * match, so chipsets declare which families they accept.
 */
export type CpuFamily =
  | 'Zen3'
  | 'Zen4'
  | 'Zen5'
  | 'AlderLake'
  | 'RaptorLake'
  | 'RaptorLakeRefresh'
  | 'ArrowLake'

export interface Cpu extends BasePart {
  category: 'cpu'
  socket: Socket
  family: CpuFamily
  cores: number
  /** Performance cores on hybrid Intel parts; omitted on uniform designs. */
  pCores?: number
  eCores?: number
  threads: number
  baseClock: number
  boostClock: number
  tdp: number
  /** Sustained package power under all-core load; drives the wattage meter. */
  maxTurboPower?: number
  memoryType: MemoryType[]
  maxMemorySpeed: number
  integratedGraphics: string | null
  includedCooler: boolean
  pcieVersion: number
  unlocked: boolean
}

export interface Cooler extends BasePart {
  category: 'cooler'
  type: CoolerType
  /** Air coolers only — checked against case clearance. */
  heightMm?: number
  /** AIO only — checked against case radiator mounts. */
  radiatorMm?: number
  socketsSupported: Socket[]
  /** Manufacturer heat-dissipation rating in watts. */
  tdpRating: number
  /** Air coolers only — vertical clearance left for DIMMs. */
  ramClearanceMm?: number
  fanCount: number
  noiseDb?: number
  rgb: boolean
}

export interface Motherboard extends BasePart {
  category: 'motherboard'
  socket: Socket
  chipset: string
  formFactor: MoboFormFactor
  memoryType: MemoryType
  memorySlots: number
  maxMemoryGb: number
  maxMemorySpeed: number
  m2Slots: number
  sataPorts: number
  pcieX16Slots: number
  pcieVersion: number
  wifi: boolean
}

export interface Memory extends BasePart {
  category: 'memory'
  type: MemoryType
  speed: number
  moduleCount: number
  moduleCapacityGb: number
  casLatency: number
  voltage: number
  /** Height including heatspreader — checked against air-cooler clearance. */
  heightMm: number
  rgb: boolean
}

export interface Storage extends BasePart {
  category: 'storage'
  interface: StorageInterface
  formFactor: StorageFormFactor
  capacityGb: number
  /** null on mechanical drives. */
  readMbps: number | null
  writeMbps: number | null
  pcieVersion?: number
  rpm?: number
  dram?: boolean
}

export interface Gpu extends BasePart {
  category: 'gpu'
  chipset: string
  vramGb: number
  vramType: string
  lengthMm: number
  heightMm?: number
  slotWidth: number
  tdp: number
  recommendedPsuW: number
  powerConnectors: PowerConnectors
  pcieVersion: number
  outputs: string[]
}

export interface RadiatorSupport {
  top?: number[]
  front?: number[]
  rear?: number[]
}

export interface PcCase extends BasePart {
  category: 'case'
  /** Physical size class of the case itself. */
  caseType: 'Full Tower' | 'Mid Tower' | 'Mini Tower' | 'Small Form Factor'
  motherboardSupport: MoboFormFactor[]
  maxGpuLengthMm: number
  maxCoolerHeightMm: number
  maxPsuLengthMm: number
  radiatorSupport: RadiatorSupport
  psuFormFactors: PsuFormFactor[]
  bays25: number
  bays35: number
  includedFans: number
  sidePanel: string
}

export interface Psu extends BasePart {
  category: 'psu'
  wattage: number
  efficiency: string
  formFactor: PsuFormFactor
  lengthMm: number
  modular: 'full' | 'semi' | 'none'
  connectors: PowerConnectors
  /** ATX 3.x parts tolerate modern GPU transient spikes. */
  atx3: boolean
}

export interface Fan extends BasePart {
  category: 'fan'
  sizeMm: number
  quantity: number
  rpmMax: number
  cfm: number
  staticPressure?: number
  noiseDb: number
  pwm: boolean
  rgb: boolean
}

export interface Monitor extends BasePart {
  category: 'monitor'
  sizeIn: number
  resolution: string
  refreshHz: number
  panelType: string
  responseMs: number
  aspectRatio: string
  curved: boolean
  adaptiveSync: string
  hdr: string | null
  ports: string[]
}

export type Part =
  | Cpu
  | Cooler
  | Motherboard
  | Memory
  | Storage
  | Gpu
  | PcCase
  | Psu
  | Fan
  | Monitor

/** Maps a category literal to its concrete part type. */
export interface PartByCategory {
  cpu: Cpu
  cooler: Cooler
  motherboard: Motherboard
  memory: Memory
  storage: Storage
  gpu: Gpu
  case: PcCase
  psu: Psu
  fan: Fan
  monitor: Monitor
}

/**
 * `singular` is written to read naturally mid-sentence ("Choose a CPU",
 * "Choose a motherboard"), so acronyms keep their capitals and everything else
 * stays lower case. Do not lower-case it at the call site.
 */
export const CATEGORY_META: Record<
  Category,
  { label: string; singular: string; icon: string; required: boolean; multiple: boolean }
> = {
  cpu: { label: 'CPU', singular: 'CPU', icon: 'cpu', required: true, multiple: false },
  cooler: { label: 'CPU Cooler', singular: 'CPU cooler', icon: 'fan', required: false, multiple: false },
  motherboard: { label: 'Motherboard', singular: 'motherboard', icon: 'board', required: true, multiple: false },
  memory: { label: 'Memory', singular: 'memory kit', icon: 'memory', required: true, multiple: true },
  storage: { label: 'Storage', singular: 'drive', icon: 'drive', required: true, multiple: true },
  gpu: { label: 'Video Card', singular: 'video card', icon: 'gpu', required: false, multiple: false },
  case: { label: 'Case', singular: 'case', icon: 'case', required: true, multiple: false },
  psu: { label: 'Power Supply', singular: 'power supply', icon: 'psu', required: true, multiple: false },
  fan: { label: 'Case Fans', singular: 'fan pack', icon: 'fan', required: false, multiple: true },
  monitor: { label: 'Monitor', singular: 'monitor', icon: 'monitor', required: false, multiple: true },
}
