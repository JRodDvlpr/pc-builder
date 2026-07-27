import { isMulti, type BuildSelection } from '../build/types'
import { getPart } from '../catalog'
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
} from '../catalog/types'
import { estimatePower } from './power'
import { RULES } from './rules'
import type { CompatReport, Issue, ResolvedBuild, ResolvedEntry } from './types'

function entries<T extends Part>(selection: BuildSelection, category: Category): ResolvedEntry<T>[] {
  return selection[category]
    .map((item) => {
      const part = getPart(item.partId) as T | undefined
      return part ? { part, qty: item.qty } : null
    })
    .filter((e): e is ResolvedEntry<T> => e !== null)
}

function single<T extends Part>(selection: BuildSelection, category: Category): T | undefined {
  return entries<T>(selection, category)[0]?.part
}

/** Turn stored ids into catalog objects, dropping anything no longer in the catalog. */
export function resolveBuild(selection: BuildSelection): ResolvedBuild {
  return {
    cpu: single<Cpu>(selection, 'cpu'),
    cooler: single<Cooler>(selection, 'cooler'),
    motherboard: single<Motherboard>(selection, 'motherboard'),
    case: single<PcCase>(selection, 'case'),
    psu: single<Psu>(selection, 'psu'),
    gpu: single<Gpu>(selection, 'gpu'),
    memory: entries<Memory>(selection, 'memory'),
    storage: entries<Storage>(selection, 'storage'),
    fan: entries<Fan>(selection, 'fan'),
    monitor: entries<Monitor>(selection, 'monitor'),
  }
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

export function analyze(build: ResolvedBuild): CompatReport {
  const issues = RULES.flatMap((rule) => rule.run(build)).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
  const errors = issues.filter((i) => i.severity === 'error')
  return {
    issues,
    errors,
    warnings: issues.filter((i) => i.severity === 'warning'),
    infos: issues.filter((i) => i.severity === 'info'),
    power: estimatePower(build, build.psu?.wattage),
    buildable: errors.length === 0,
  }
}

export function analyzeSelection(selection: BuildSelection): CompatReport {
  return analyze(resolveBuild(selection))
}

/** Place a candidate part into a build, replacing or appending as the category dictates. */
function withCandidate(build: ResolvedBuild, candidate: Part): ResolvedBuild {
  const next: ResolvedBuild = { ...build }
  switch (candidate.category) {
    case 'cpu':
      next.cpu = candidate as Cpu
      break
    case 'cooler':
      next.cooler = candidate as Cooler
      break
    case 'motherboard':
      next.motherboard = candidate as Motherboard
      break
    case 'case':
      next.case = candidate as PcCase
      break
    case 'psu':
      next.psu = candidate as Psu
      break
    case 'gpu':
      next.gpu = candidate as Gpu
      break
    case 'memory':
      next.memory = [...build.memory, { part: candidate as Memory, qty: 1 }]
      break
    case 'storage':
      next.storage = [...build.storage, { part: candidate as Storage, qty: 1 }]
      break
    case 'fan':
      next.fan = [...build.fan, { part: candidate as Fan, qty: 1 }]
      break
    case 'monitor':
      next.monitor = [...build.monitor, { part: candidate as Monitor, qty: 1 }]
      break
  }
  return next
}

/**
 * Issues that picking `candidate` would introduce, given the rest of the build.
 *
 * This is what powers "hide incompatible" and the inline reason shown on dimmed
 * rows in the part picker: the user finds out why a board will not work before
 * clicking it, instead of after. Only issues naming the candidate are returned,
 * so pre-existing problems elsewhere in the build do not bleed in.
 *
 * Multi-select categories are evaluated as an addition to what is already
 * chosen, which is what makes "you have no M.2 slots left" surface correctly.
 */
export function candidateIssues(build: ResolvedBuild, candidate: Part): Issue[] {
  const hypothetical = withCandidate(build, candidate)
  const before = new Set(
    RULES.flatMap((r) => r.run(build)).map((i) => `${i.ruleId}|${i.partIds.join(',')}|${i.detail}`),
  )
  return RULES.flatMap((r) => r.run(hypothetical))
    .filter((i) => i.severity !== 'info')
    .filter((i) => i.partIds.includes(candidate.id))
    .filter((i) => !before.has(`${i.ruleId}|${i.partIds.join(',')}|${i.detail}`))
}

/** Convenience for the picker: the worst severity a candidate would introduce. */
export function candidateVerdict(
  build: ResolvedBuild,
  candidate: Part,
): { severity: 'ok' | 'warning' | 'error'; issues: Issue[] } {
  const issues = candidateIssues(build, candidate)
  if (issues.some((i) => i.severity === 'error')) return { severity: 'error', issues }
  if (issues.length > 0) return { severity: 'warning', issues }
  return { severity: 'ok', issues }
}

/**
 * Remove a category's selection before evaluating candidates for it.
 *
 * Without this, every alternative CPU would be compared against a build that
 * still contains the CPU already chosen, and single-select swaps would look
 * fine only if they matched the incumbent.
 */
export function buildWithout(build: ResolvedBuild, category: Category): ResolvedBuild {
  if (isMulti(category)) return build
  const next: ResolvedBuild = { ...build }
  switch (category) {
    case 'cpu':
      delete next.cpu
      break
    case 'cooler':
      delete next.cooler
      break
    case 'motherboard':
      delete next.motherboard
      break
    case 'case':
      delete next.case
      break
    case 'psu':
      delete next.psu
      break
    case 'gpu':
      delete next.gpu
      break
  }
  return next
}
