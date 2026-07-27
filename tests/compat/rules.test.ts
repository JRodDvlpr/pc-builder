import { describe, expect, it } from 'vitest'

import { emptyBuild, type BuildSelection } from '@/lib/build/types'
import { CATALOG_SIZE, getPart } from '@/lib/catalog'
import { analyzeSelection, buildWithout, candidateVerdict, resolveBuild } from '@/lib/compat/engine'
import { estimatePower } from '@/lib/compat/power'
import type { Severity } from '@/lib/compat/types'

/** Build a selection from `category: partId` pairs, with qty 1 throughout. */
function build(parts: Record<string, string | string[]>): BuildSelection {
  const sel = emptyBuild()
  for (const [category, ids] of Object.entries(parts)) {
    const list = Array.isArray(ids) ? ids : [ids]
    sel[category as keyof BuildSelection] = list.map((partId) => ({ partId, qty: 1 }))
  }
  return sel
}

function ruleIds(sel: BuildSelection, severity: Severity): string[] {
  return analyzeSelection(sel)
    .issues.filter((i) => i.severity === severity)
    .map((i) => i.ruleId)
}

/** A sane, real, fully-specified AM5 gaming build used as the control. */
const GOOD_AM5 = build({
  cpu: 'cpu-9800x3d',
  cooler: 'cool-lf3-360',
  motherboard: 'mb-b850-tomahawk',
  memory: 'mem-tz5-6000c30-32',
  storage: 'ssd-990pro-2tb',
  gpu: 'gpu-5070ti-tuf',
  case: 'case-lancool-216',
  psu: 'psu-rm850e',
})

describe('catalog integrity', () => {
  it('loads every part and resolves ids', () => {
    expect(CATALOG_SIZE).toBeGreaterThan(400)
    expect(getPart('cpu-9800x3d')?.model).toBe('Ryzen 7 9800X3D')
    expect(getPart('does-not-exist')).toBeUndefined()
  })

  it('every part referenced by the fixture builds exists', () => {
    for (const items of Object.values(GOOD_AM5)) {
      for (const item of items) expect(getPart(item.partId), item.partId).toBeDefined()
    }
  })
})

describe('a known-good build', () => {
  it('reports no errors and no warnings', () => {
    const report = analyzeSelection(GOOD_AM5)
    expect(report.errors, JSON.stringify(report.errors.map((e) => e.title))).toHaveLength(0)
    expect(report.warnings, JSON.stringify(report.warnings.map((e) => e.title))).toHaveLength(0)
    expect(report.buildable).toBe(true)
  })

  it('is not flagged as incomplete', () => {
    expect(ruleIds(GOOD_AM5, 'info')).not.toContain('completeness')
  })

  it('estimates a plausible power draw', () => {
    const report = analyzeSelection(GOOD_AM5)
    // 9800X3D (162 W) + RTX 5070 Ti (345 W) + board, memory, drive, fans.
    expect(report.power.totalWatts).toBeGreaterThan(500)
    expect(report.power.totalWatts).toBeLessThan(650)
    expect(report.power.recommendedPsuW).toBeGreaterThanOrEqual(750)
    expect(report.power.loadPct).toBeGreaterThan(50)
    expect(report.power.loadPct).toBeLessThan(80)
  })
})

describe('socket and chipset rules', () => {
  it('rejects an AM5 CPU on an LGA1700 board', () => {
    const sel = build({ cpu: 'cpu-9800x3d', motherboard: 'mb-z790-tomahawk' })
    expect(ruleIds(sel, 'error')).toContain('cpu-socket')
  })

  it('rejects a Zen 3 CPU on an AM5 board', () => {
    const sel = build({ cpu: 'cpu-5800x3d', motherboard: 'mb-b850-tomahawk' })
    expect(ruleIds(sel, 'error')).toContain('cpu-socket')
  })

  it('rejects an Arrow Lake CPU on a Z790 board despite both being Intel', () => {
    const sel = build({ cpu: 'cpu-ultra9-285k', motherboard: 'mb-z790-tomahawk' })
    expect(ruleIds(sel, 'error')).toContain('cpu-socket')
  })

  it('flags a BIOS update where the chipset predates the CPU family', () => {
    const sel = build({ cpu: 'cpu-9700x', motherboard: 'mb-b650-tomahawk' })
    expect(ruleIds(sel, 'info')).toContain('chipset-cpu-family')
    expect(ruleIds(sel, 'error')).not.toContain('chipset-cpu-family')
  })

  it('accepts a matched socket and chipset silently', () => {
    const sel = build({ cpu: 'cpu-9800x3d', motherboard: 'mb-b850-tomahawk' })
    expect(ruleIds(sel, 'error')).not.toContain('chipset-cpu-family')
  })
})

describe('memory rules', () => {
  it('rejects DDR4 in a DDR5 board', () => {
    const sel = build({ motherboard: 'mb-b850-tomahawk', memory: 'mem-lpx-3200c16-32' })
    expect(ruleIds(sel, 'error')).toContain('memory-type')
  })

  it('rejects DDR5 on a DDR4-only CPU', () => {
    const sel = build({ cpu: 'cpu-5600x', memory: 'mem-tz5-6000c30-32' })
    expect(ruleIds(sel, 'error')).toContain('memory-type')
  })

  it('rejects more modules than the board has slots', () => {
    // Two 4-module kits on a 4-slot board.
    const sel = build({ motherboard: 'mb-b850-tomahawk', memory: ['mem-tz5-6000c30-128'] })
    const sel2: BuildSelection = { ...sel, memory: [{ partId: 'mem-tz5-6000c30-128', qty: 2 }] }
    expect(ruleIds(sel2, 'error')).toContain('memory-capacity')
  })

  it('rejects a 4-module kit on a 2-slot ITX board', () => {
    const sel = build({ motherboard: 'mb-b850i-edge', memory: 'mem-tz5-6000c30-128' })
    expect(ruleIds(sel, 'error')).toContain('memory-capacity')
  })

  it('asks for EXPO when the kit outruns the CPU spec', () => {
    const sel = build({ cpu: 'cpu-9800x3d', motherboard: 'mb-b850-tomahawk', memory: 'mem-tz5-6000c30-32' })
    expect(ruleIds(sel, 'info')).toContain('memory-speed')
  })

  it('warns when the kit outruns the board itself', () => {
    const sel = build({ motherboard: 'mb-b450m-ds3h', memory: 'mem-tz-royal-4000c17-32' })
    expect(ruleIds(sel, 'warning')).toContain('memory-speed')
  })
})

describe('physical fit rules', () => {
  it('rejects an ATX board in a Mini-ITX case', () => {
    const sel = build({ motherboard: 'mb-b850-tomahawk', case: 'case-a4h2o' })
    expect(ruleIds(sel, 'error')).toContain('mobo-case-fit')
  })

  it('rejects an oversized video card', () => {
    // 358 mm Astral in a case rated for 322 mm.
    const sel = build({ gpu: 'gpu-5090-astral', case: 'case-a4h2o' })
    expect(ruleIds(sel, 'error')).toContain('gpu-clearance')
  })

  it('warns when video card clearance is within 10 mm', () => {
    // 358 mm card, 362 mm limit.
    const sel = build({ gpu: 'gpu-5090-astral', case: 'case-o11d-mini' })
    expect(ruleIds(sel, 'warning')).toContain('gpu-clearance')
  })

  it('rejects a tall air cooler in a slim case', () => {
    const sel = build({ cooler: 'cool-nh-d15-g2', case: 'case-terra' })
    expect(ruleIds(sel, 'error')).toContain('cooler-clearance')
  })

  it('rejects a radiator size the case cannot mount', () => {
    const sel = build({ cooler: 'cool-lf3-420', case: 'case-lancool-216' })
    expect(ruleIds(sel, 'error')).toContain('radiator-fit')
  })

  it('rejects a cooler with no bracket for the socket', () => {
    const sel = build({ cpu: 'cpu-9800x3d', cooler: 'cool-nh-l9a' })
    expect(ruleIds(sel, 'error')).not.toContain('cooler-socket') // NH-L9a-AM5 is AM5
    const sel2 = build({ cpu: 'cpu-14900k', cooler: 'cool-nh-l9a' })
    expect(ruleIds(sel2, 'error')).toContain('cooler-socket')
  })

  it('rejects an ATX power supply in an SFX-only case', () => {
    const sel = build({ psu: 'psu-rm850e', case: 'case-a4h2o' })
    expect(ruleIds(sel, 'error')).toContain('psu-case-fit')
  })
})

describe('power rules', () => {
  it('rejects a build that outdraws its power supply', () => {
    const sel = build({
      cpu: 'cpu-14900k',
      motherboard: 'mb-z790-tomahawk',
      gpu: 'gpu-5090-astral',
      psu: 'psu-corsair-cx550',
    })
    expect(ruleIds(sel, 'error')).toContain('psu-capacity')
  })

  it('warns when load exceeds 80% of the supply', () => {
    const sel = build({
      cpu: 'cpu-9800x3d',
      motherboard: 'mb-b850-tomahawk',
      memory: 'mem-tz5-6000c30-32',
      gpu: 'gpu-5080-fe',
      psu: 'psu-focus-gx650',
      case: 'case-lancool-216',
    })
    const warnings = ruleIds(sel, 'warning')
    expect(warnings).toContain('psu-capacity')
    expect(ruleIds(sel, 'error')).not.toContain('psu-capacity')
  })

  it('warns when a 12VHPWR card is paired with a supply that lacks the cable', () => {
    const sel = build({ gpu: 'gpu-5080-fe', psu: 'psu-evga-g7-850' })
    expect(ruleIds(sel, 'warning')).toContain('psu-connectors')
  })

  it('rejects a card needing more 8-pin cables than the supply has', () => {
    const sel = build({ gpu: 'gpu-9070xt-tuf', psu: 'psu-thermalright-tg600' })
    expect(ruleIds(sel, 'error')).toContain('psu-connectors')
  })

  it('excludes monitors from the power estimate', () => {
    const withMonitor = resolveBuild(build({ cpu: 'cpu-9700x', monitor: 'mon-aw3225qf' }))
    const without = resolveBuild(build({ cpu: 'cpu-9700x' }))
    expect(estimatePower(withMonitor).totalWatts).toBe(estimatePower(without).totalWatts)
  })

  it('counts fans the case ships with', () => {
    const withCase = resolveBuild(build({ cpu: 'cpu-9700x', case: 'case-montech-king95' }))
    const without = resolveBuild(build({ cpu: 'cpu-9700x' }))
    expect(estimatePower(withCase).totalWatts).toBeGreaterThan(estimatePower(without).totalWatts)
  })
})

describe('storage rules', () => {
  it('rejects more M.2 drives than the board has slots', () => {
    const sel: BuildSelection = {
      ...build({ motherboard: 'mb-a620m-h' }),
      storage: [{ partId: 'ssd-990pro-1tb', qty: 2 }],
    }
    expect(ruleIds(sel, 'error')).toContain('storage-ports')
  })

  it('rejects more 3.5" drives than the case has bays', () => {
    const sel: BuildSelection = {
      ...build({ case: 'case-h5-flow-2024', motherboard: 'mb-b850-tomahawk' }),
      storage: [{ partId: 'hdd-ironwolf-8tb', qty: 4 }],
    }
    expect(ruleIds(sel, 'error')).toContain('drive-bays')
  })
})

describe('display output', () => {
  it('rejects a CPU with no iGPU and no video card', () => {
    const sel = build({ cpu: 'cpu-7500f' })
    expect(ruleIds(sel, 'error')).toContain('display-output')
  })

  it('accepts the same CPU once a video card is added', () => {
    const sel = build({ cpu: 'cpu-7500f', gpu: 'gpu-5070-fe' })
    expect(ruleIds(sel, 'error')).not.toContain('display-output')
  })

  it('accepts a CPU with integrated graphics on its own', () => {
    const sel = build({ cpu: 'cpu-9700x' })
    expect(ruleIds(sel, 'error')).not.toContain('display-output')
  })
})

describe('cooler presence', () => {
  it('warns when a cooler-less CPU has no cooler selected', () => {
    expect(ruleIds(build({ cpu: 'cpu-9800x3d' }), 'warning')).toContain('cooler-present')
  })

  it('stays quiet for a CPU that ships with one', () => {
    expect(ruleIds(build({ cpu: 'cpu-12400f' }), 'warning')).not.toContain('cooler-present')
  })
})

describe('completeness', () => {
  it('flags an empty build as incomplete', () => {
    expect(ruleIds(emptyBuild(), 'info')).toContain('completeness')
  })
})

describe('candidate evaluation for the part picker', () => {
  it('marks an incompatible board as an error before it is picked', () => {
    const current = resolveBuild(build({ cpu: 'cpu-9800x3d' }))
    const verdict = candidateVerdict(current, getPart('mb-z790-tomahawk')!)
    expect(verdict.severity).toBe('error')
    expect(verdict.issues.map((i) => i.ruleId)).toContain('cpu-socket')
  })

  it('marks a compatible board as ok', () => {
    const current = resolveBuild(build({ cpu: 'cpu-9800x3d' }))
    expect(candidateVerdict(current, getPart('mb-b850-tomahawk')!).severity).toBe('ok')
  })

  it('does not blame a candidate for problems that already existed', () => {
    // The build already has a socket mismatch; a monitor must not inherit it.
    const current = resolveBuild(build({ cpu: 'cpu-9800x3d', motherboard: 'mb-z790-tomahawk' }))
    expect(candidateVerdict(current, getPart('mon-aw3225qf')!).severity).toBe('ok')
  })

  it('evaluates a replacement CPU against a build with its own CPU removed', () => {
    const full = resolveBuild(GOOD_AM5)
    // Swapping in an LGA1700 chip should conflict with the AM5 board...
    const withoutCpu = buildWithout(full, 'cpu')
    expect(candidateVerdict(withoutCpu, getPart('cpu-14900k')!).severity).toBe('error')
    // ...while another AM5 chip is fine.
    expect(candidateVerdict(withoutCpu, getPart('cpu-9950x')!).severity).toBe('ok')
  })

  it('reports no free M.2 slot when the board is already full', () => {
    const sel: BuildSelection = {
      ...build({ motherboard: 'mb-a620m-h' }),
      storage: [{ partId: 'ssd-990pro-1tb', qty: 1 }],
    }
    const current = resolveBuild(sel)
    expect(candidateVerdict(current, getPart('ssd-sn850x-2tb')!).severity).toBe('error')
  })
})
