import type {
  Category,
  Cooler,
  Cpu,
  Fan,
  Gpu,
  Memory,
  Monitor,
  Motherboard,
  PcCase,
  Psu,
  Storage,
} from '../catalog/types'

/**
 * error   — the build will not physically assemble or will not post.
 * warning — it works, but something is compromised (thermals, headroom, speed).
 * info    — worth knowing; usually an incomplete build or a BIOS caveat.
 */
export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  /** Stable rule identifier, e.g. `cpu-socket`. Used as a React key and in tests. */
  ruleId: string
  severity: Severity
  /** One-line summary shown in the issue list. */
  title: string
  /** Full explanation naming the specific numbers involved. */
  detail: string
  /** Catalog ids of every part implicated — the UI offers a jump-to-swap per part. */
  partIds: string[]
  /** Categories to highlight in the build table. */
  categories: Category[]
}

export interface ResolvedEntry<T> {
  part: T
  qty: number
}

/**
 * A build with catalog parts already looked up. Rules operate on this rather
 * than on ids so they stay pure and trivially testable.
 */
export interface ResolvedBuild {
  cpu?: Cpu
  cooler?: Cooler
  motherboard?: Motherboard
  case?: PcCase
  psu?: Psu
  gpu?: Gpu
  memory: ResolvedEntry<Memory>[]
  storage: ResolvedEntry<Storage>[]
  fan: ResolvedEntry<Fan>[]
  monitor: ResolvedEntry<Monitor>[]
}

export interface PowerLine {
  label: string
  watts: number
  category: Category | 'system'
}

export interface PowerEstimate {
  /** Estimated sustained system draw at the wall-side of the PSU, in watts. */
  totalWatts: number
  breakdown: PowerLine[]
  /** Suggested PSU size with headroom for transients, rounded up to 50 W. */
  recommendedPsuW: number
  /** Percentage of the selected PSU's rated output this build would use. */
  loadPct: number | null
}

export interface CompatReport {
  issues: Issue[]
  errors: Issue[]
  warnings: Issue[]
  infos: Issue[]
  power: PowerEstimate
  /** False when any error-severity issue is present. */
  buildable: boolean
}

/** A single compatibility check. Returns any number of issues. */
export interface Rule {
  id: string
  run(build: ResolvedBuild): Issue[]
}
