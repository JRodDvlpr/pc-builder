import { FAMILY_LABELS, chipsetInfo } from '../catalog/platforms'
import type { Category } from '../catalog/types'
import { estimatePower } from './power'
import type { Issue, Rule, Severity } from './types'

function issue(
  ruleId: string,
  severity: Severity,
  title: string,
  detail: string,
  partIds: (string | undefined)[],
  categories: Category[],
): Issue {
  return {
    ruleId,
    severity,
    title,
    detail,
    partIds: partIds.filter((id): id is string => Boolean(id)),
    categories,
  }
}

const mm = (n: number) => `${n} mm`

/** CPU and motherboard must share a physical socket. */
const cpuSocket: Rule = {
  id: 'cpu-socket',
  run(b) {
    if (!b.cpu || !b.motherboard) return []
    if (b.cpu.socket === b.motherboard.socket) return []
    return [
      issue(
        'cpu-socket',
        'error',
        'CPU and motherboard sockets do not match',
        `${b.cpu.model} is an ${b.cpu.socket} processor, but ${b.motherboard.model} has an ${b.motherboard.socket} socket. These are physically incompatible.`,
        [b.cpu.id, b.motherboard.id],
        ['cpu', 'motherboard'],
      ),
    ]
  },
}

/** Matching socket is not enough — the chipset must also support the CPU generation. */
const chipsetFamily: Rule = {
  id: 'chipset-cpu-family',
  run(b) {
    if (!b.cpu || !b.motherboard) return []
    if (b.cpu.socket !== b.motherboard.socket) return [] // cpu-socket already reported this
    const info = chipsetInfo(b.motherboard.chipset)
    if (!info) return []

    if (!info.families.includes(b.cpu.family)) {
      return [
        issue(
          'chipset-cpu-family',
          'error',
          `${b.motherboard.chipset} does not support ${FAMILY_LABELS[b.cpu.family]}`,
          `${b.motherboard.model} uses the ${b.motherboard.chipset} chipset, which supports ${info.families
            .map((f) => FAMILY_LABELS[f])
            .join(', ')}. ${b.cpu.model} will not run on it.`,
          [b.cpu.id, b.motherboard.id],
          ['cpu', 'motherboard'],
        ),
      ]
    }

    if (info.biosUpdateFor?.includes(b.cpu.family)) {
      return [
        issue(
          'chipset-cpu-family',
          'info',
          'May need a BIOS update before first boot',
          `${b.motherboard.chipset} boards shipped before ${FAMILY_LABELS[b.cpu.family]} launched. If this board has old firmware it will need a BIOS flash — check for BIOS Flashback support, which updates without a working CPU.`,
          [b.cpu.id, b.motherboard.id],
          ['cpu', 'motherboard'],
        ),
      ]
    }
    return []
  },
}

/** DDR4 and DDR5 are keyed differently and will not fit each other's slots. */
const memoryType: Rule = {
  id: 'memory-type',
  run(b) {
    const out: Issue[] = []
    for (const { part } of b.memory) {
      if (b.motherboard && part.type !== b.motherboard.memoryType) {
        out.push(
          issue(
            'memory-type',
            'error',
            `${part.type} memory will not fit a ${b.motherboard.memoryType} board`,
            `${b.motherboard.model} takes ${b.motherboard.memoryType} only. ${part.model} is ${part.type}, and the modules are physically keyed so they cannot be installed.`,
            [part.id, b.motherboard.id],
            ['memory', 'motherboard'],
          ),
        )
      }
      if (b.cpu && !b.cpu.memoryType.includes(part.type)) {
        out.push(
          issue(
            'memory-type',
            'error',
            `${b.cpu.model} does not support ${part.type}`,
            `${b.cpu.model}'s memory controller supports ${b.cpu.memoryType.join(' and ')}. ${part.model} is ${part.type}.`,
            [part.id, b.cpu.id],
            ['memory', 'cpu'],
          ),
        )
      }
    }
    return out
  },
}

/** Total DIMM count and capacity must fit the board. */
const memoryCapacity: Rule = {
  id: 'memory-capacity',
  run(b) {
    if (!b.motherboard || b.memory.length === 0) return []
    const out: Issue[] = []
    const modules = b.memory.reduce((n, m) => n + m.part.moduleCount * m.qty, 0)
    const totalGb = b.memory.reduce((n, m) => n + m.part.moduleCount * m.part.moduleCapacityGb * m.qty, 0)

    if (modules > b.motherboard.memorySlots) {
      out.push(
        issue(
          'memory-capacity',
          'error',
          'More memory modules than the board has slots',
          `You have selected ${modules} modules but ${b.motherboard.model} has only ${b.motherboard.memorySlots} DIMM slots.`,
          [b.motherboard.id, ...b.memory.map((m) => m.part.id)],
          ['memory', 'motherboard'],
        ),
      )
    }
    if (totalGb > b.motherboard.maxMemoryGb) {
      out.push(
        issue(
          'memory-capacity',
          'error',
          'Memory capacity exceeds the board maximum',
          `${totalGb} GB selected, but ${b.motherboard.model} supports at most ${b.motherboard.maxMemoryGb} GB.`,
          [b.motherboard.id, ...b.memory.map((m) => m.part.id)],
          ['memory', 'motherboard'],
        ),
      )
    }
    return out
  },
}

/**
 * Rated kit speed vs what the board and CPU can actually drive. A kit faster
 * than the CPU's official spec is normal and just needs XMP/EXPO enabled, so
 * that is info rather than a warning — the board being unable to reach the
 * speed at all is the real problem.
 */
const memorySpeed: Rule = {
  id: 'memory-speed',
  run(b) {
    const out: Issue[] = []
    for (const { part } of b.memory) {
      if (b.motherboard && part.speed > b.motherboard.maxMemorySpeed) {
        out.push(
          issue(
            'memory-speed',
            'warning',
            'Memory is faster than the board supports',
            `${part.model} is rated ${part.type}-${part.speed}, but ${b.motherboard.model} tops out at ${b.motherboard.maxMemorySpeed}. The kit will run at the lower speed.`,
            [part.id, b.motherboard.id],
            ['memory', 'motherboard'],
          ),
        )
      } else if (b.cpu && part.speed > b.cpu.maxMemorySpeed) {
        const profile = b.cpu.brand === 'AMD' ? 'EXPO' : 'XMP'
        out.push(
          issue(
            'memory-speed',
            'info',
            `Enable ${profile} to reach the rated speed`,
            `${part.model} runs at ${part.type}-${b.cpu.maxMemorySpeed} out of the box because that is ${b.cpu.model}'s official spec. Turning on the ${profile} profile in BIOS unlocks the rated ${part.speed}.`,
            [part.id, b.cpu.id],
            ['memory', 'cpu'],
          ),
        )
      }
    }
    return out
  },
}

/** The board has to bolt into the case. */
const moboCaseFit: Rule = {
  id: 'mobo-case-fit',
  run(b) {
    if (!b.motherboard || !b.case) return []
    if (b.case.motherboardSupport.includes(b.motherboard.formFactor)) return []
    return [
      issue(
        'mobo-case-fit',
        'error',
        'Motherboard does not fit this case',
        `${b.motherboard.model} is ${b.motherboard.formFactor}. ${b.case.model} accepts ${b.case.motherboardSupport.join(', ')}.`,
        [b.motherboard.id, b.case.id],
        ['motherboard', 'case'],
      ),
    ]
  },
}

const gpuClearance: Rule = {
  id: 'gpu-clearance',
  run(b) {
    if (!b.gpu || !b.case) return []
    const limit = b.case.maxGpuLengthMm
    const len = b.gpu.lengthMm
    if (len > limit) {
      return [
        issue(
          'gpu-clearance',
          'error',
          'Video card is too long for the case',
          `${b.gpu.model} is ${mm(len)} long. ${b.case.model} allows up to ${mm(limit)} — ${mm(len - limit)} too short.`,
          [b.gpu.id, b.case.id],
          ['gpu', 'case'],
        ),
      ]
    }
    if (limit - len <= 10) {
      return [
        issue(
          'gpu-clearance',
          'warning',
          'Very tight video card clearance',
          `${b.gpu.model} is ${mm(len)} in a case rated for ${mm(limit)}, leaving only ${mm(limit - len)}. Front fan or radiator thickness may not fit alongside it.`,
          [b.gpu.id, b.case.id],
          ['gpu', 'case'],
        ),
      ]
    }
    return []
  },
}

const coolerClearance: Rule = {
  id: 'cooler-clearance',
  run(b) {
    if (!b.cooler || !b.case || b.cooler.type !== 'air' || !b.cooler.heightMm) return []
    const limit = b.case.maxCoolerHeightMm
    const h = b.cooler.heightMm
    if (h > limit) {
      return [
        issue(
          'cooler-clearance',
          'error',
          'CPU cooler is too tall for the case',
          `${b.cooler.model} stands ${mm(h)} tall. ${b.case.model} allows up to ${mm(limit)}. The side panel will not close.`,
          [b.cooler.id, b.case.id],
          ['cooler', 'case'],
        ),
      ]
    }
    if (limit - h <= 5) {
      return [
        issue(
          'cooler-clearance',
          'warning',
          'Very tight CPU cooler clearance',
          `${b.cooler.model} is ${mm(h)} against a ${mm(limit)} limit. It should fit, but there is almost no margin for panel bowing or fan repositioning.`,
          [b.cooler.id, b.case.id],
          ['cooler', 'case'],
        ),
      ]
    }
    return []
  },
}

/** The cooler must have a mounting kit for the CPU's socket. */
const coolerSocket: Rule = {
  id: 'cooler-socket',
  run(b) {
    if (!b.cooler || !b.cpu) return []
    if (b.cooler.socketsSupported.includes(b.cpu.socket)) return []
    return [
      issue(
        'cooler-socket',
        'error',
        'Cooler does not mount on this socket',
        `${b.cooler.model} ships brackets for ${b.cooler.socketsSupported.join(', ')}. ${b.cpu.model} is ${b.cpu.socket}.`,
        [b.cooler.id, b.cpu.id],
        ['cooler', 'cpu'],
      ),
    ]
  },
}

/** An AIO needs a radiator mount of the right size somewhere in the case. */
const radiatorFit: Rule = {
  id: 'radiator-fit',
  run(b) {
    if (!b.cooler || !b.case || b.cooler.type !== 'aio' || !b.cooler.radiatorMm) return []
    const size = b.cooler.radiatorMm
    const support = b.case.radiatorSupport
    const positions = (['top', 'front', 'rear'] as const).filter((p) => support[p]?.includes(size))
    if (positions.length > 0) return []
    const available = [...new Set(Object.values(support).flat())].sort((a, b2) => a - b2)
    return [
      issue(
        'radiator-fit',
        'error',
        `Case has no ${size} mm radiator mount`,
        `${b.cooler.model} uses a ${size} mm radiator. ${b.case.model} supports ${available.length ? `${available.join(', ')} mm` : 'no radiators'}.`,
        [b.cooler.id, b.case.id],
        ['cooler', 'case'],
      ),
    ]
  },
}

/** A cooler rated below the CPU's sustained power will throttle it. */
const coolerCapacity: Rule = {
  id: 'cooler-capacity',
  run(b) {
    if (!b.cooler || !b.cpu) return []
    const load = b.cpu.maxTurboPower ?? b.cpu.tdp
    if (b.cooler.tdpRating >= load) return []
    return [
      issue(
        'cooler-capacity',
        'warning',
        'Cooler may not keep up with this CPU',
        `${b.cpu.model} can draw ${load} W sustained, above ${b.cooler.model}'s ${b.cooler.tdpRating} W rating. Expect thermal throttling under all-core load.`,
        [b.cooler.id, b.cpu.id],
        ['cooler', 'cpu'],
      ),
    ]
  },
}

/** A CPU with no boxed cooler and nothing selected will not run. */
const coolerPresent: Rule = {
  id: 'cooler-present',
  run(b) {
    if (!b.cpu || b.cooler) return []
    if (b.cpu.includedCooler) return []
    return [
      issue(
        'cooler-present',
        'warning',
        'No CPU cooler selected',
        `${b.cpu.model} does not include a stock cooler, so you need to add one.`,
        [b.cpu.id],
        ['cooler', 'cpu'],
      ),
    ]
  },
}

/** Tall heatspreaders collide with the fin stack of a big air cooler. */
const ramClearance: Rule = {
  id: 'ram-clearance',
  run(b) {
    if (!b.cooler || b.cooler.type !== 'air' || !b.cooler.ramClearanceMm) return []
    const out: Issue[] = []
    for (const { part } of b.memory) {
      if (part.heightMm > b.cooler.ramClearanceMm) {
        out.push(
          issue(
            'ram-clearance',
            'warning',
            'Memory may not clear the CPU cooler',
            `${part.model} is ${mm(part.heightMm)} tall but ${b.cooler.model} leaves ${mm(b.cooler.ramClearanceMm)} over the DIMM slots. You may need to raise the cooler's front fan or pick lower-profile memory.`,
            [part.id, b.cooler.id],
            ['memory', 'cooler'],
          ),
        )
      }
    }
    return out
  },
}

/** Estimated draw against the selected PSU. */
const psuCapacity: Rule = {
  id: 'psu-capacity',
  run(b) {
    if (!b.psu) return []
    const est = estimatePower(b, b.psu.wattage)
    const out: Issue[] = []

    if (est.totalWatts > b.psu.wattage) {
      out.push(
        issue(
          'psu-capacity',
          'error',
          'Power supply is not big enough',
          `This build draws an estimated ${est.totalWatts} W, above the ${b.psu.wattage} W ${b.psu.model} can deliver. A ${est.recommendedPsuW} W unit is recommended.`,
          [b.psu.id],
          ['psu'],
        ),
      )
    } else if (est.loadPct !== null && est.loadPct > 80) {
      out.push(
        issue(
          'psu-capacity',
          'warning',
          'Very little power supply headroom',
          `An estimated ${est.totalWatts} W is ${est.loadPct}% of the ${b.psu.wattage} W ${b.psu.model}. GPU transient spikes can trip over-current protection at this load; ${est.recommendedPsuW} W would be comfortable.`,
          [b.psu.id, b.gpu?.id],
          ['psu', 'gpu'],
        ),
      )
    }

    if (b.gpu && b.psu.wattage < b.gpu.recommendedPsuW) {
      out.push(
        issue(
          'psu-capacity',
          'warning',
          'Below the video card manufacturer recommendation',
          `${b.gpu.brand} recommends at least a ${b.gpu.recommendedPsuW} W supply for ${b.gpu.model}. This build has ${b.psu.wattage} W.`,
          [b.psu.id, b.gpu.id],
          ['psu', 'gpu'],
        ),
      )
    }

    if (b.gpu && !b.psu.atx3 && b.gpu.tdp >= 300) {
      out.push(
        issue(
          'psu-capacity',
          'info',
          'Older ATX 2.x supply with a high-draw video card',
          `${b.psu.model} predates the ATX 3.0 transient spec. ${b.gpu.model} can spike well above its ${b.gpu.tdp} W rating, so extra wattage headroom is worth having.`,
          [b.psu.id, b.gpu.id],
          ['psu', 'gpu'],
        ),
      )
    }
    return out
  },
}

/** The PSU must physically supply the cables the GPU and board need. */
const psuConnectors: Rule = {
  id: 'psu-connectors',
  run(b) {
    if (!b.psu) return []
    const out: Issue[] = []
    const have = b.psu.connectors

    if (b.gpu) {
      const need = b.gpu.powerConnectors
      const needHpwr = need.pcie12vhpwr ?? 0
      const haveHpwr = have.pcie12vhpwr ?? 0
      const have8 = have.pcie8 ?? 0

      if (needHpwr > haveHpwr) {
        // Cards ship a 12VHPWR adapter that draws off three or four 8-pin cables.
        if (have8 >= 3) {
          out.push(
            issue(
              'psu-connectors',
              'warning',
              'Needs the bundled 12VHPWR adapter',
              `${b.gpu.model} uses a 12VHPWR connector and ${b.psu.model} has none. The adapter in the card's box will work but occupies three 8-pin cables — a native ATX 3.x supply is tidier and safer.`,
              [b.gpu.id, b.psu.id],
              ['gpu', 'psu'],
            ),
          )
        } else {
          out.push(
            issue(
              'psu-connectors',
              'error',
              'Power supply cannot power this video card',
              `${b.gpu.model} needs a 12VHPWR connector. ${b.psu.model} has none and only ${have8} PCIe 8-pin cables, too few for the adapter.`,
              [b.gpu.id, b.psu.id],
              ['gpu', 'psu'],
            ),
          )
        }
      }

      const need8 = need.pcie8 ?? 0
      if (need8 > have8) {
        out.push(
          issue(
            'psu-connectors',
            'error',
            'Not enough PCIe power cables',
            `${b.gpu.model} needs ${need8} PCIe 8-pin connectors. ${b.psu.model} provides ${have8}.`,
            [b.gpu.id, b.psu.id],
            ['gpu', 'psu'],
          ),
        )
      }
    }

    if (b.motherboard && (have.eps8 ?? 0) < 1) {
      out.push(
        issue(
          'psu-connectors',
          'error',
          'No CPU power cable',
          `${b.psu.model} does not list an EPS 8-pin connector, which every motherboard needs for CPU power.`,
          [b.psu.id, b.motherboard.id],
          ['psu', 'motherboard'],
        ),
      )
    }

    const sataDrives = b.storage.filter((s) => s.part.interface === 'SATA').reduce((n, s) => n + s.qty, 0)
    if (sataDrives > (have.sata ?? 0)) {
      out.push(
        issue(
          'psu-connectors',
          'warning',
          'Not enough SATA power connectors',
          `${sataDrives} SATA drives selected but ${b.psu.model} supplies ${have.sata ?? 0} SATA power connectors. A splitter would be needed.`,
          [b.psu.id],
          ['psu', 'storage'],
        ),
      )
    }
    return out
  },
}

/** The PSU must fit the case's bay. */
const psuCaseFit: Rule = {
  id: 'psu-case-fit',
  run(b) {
    if (!b.psu || !b.case) return []
    const out: Issue[] = []
    if (!b.case.psuFormFactors.includes(b.psu.formFactor)) {
      out.push(
        issue(
          'psu-case-fit',
          'error',
          'Power supply form factor does not fit the case',
          `${b.psu.model} is ${b.psu.formFactor}. ${b.case.model} takes ${b.case.psuFormFactors.join(', ')}.`,
          [b.psu.id, b.case.id],
          ['psu', 'case'],
        ),
      )
    } else if (b.psu.lengthMm > b.case.maxPsuLengthMm) {
      out.push(
        issue(
          'psu-case-fit',
          'error',
          'Power supply is too long for the case',
          `${b.psu.model} is ${mm(b.psu.lengthMm)} deep; ${b.case.model} allows ${mm(b.case.maxPsuLengthMm)}.`,
          [b.psu.id, b.case.id],
          ['psu', 'case'],
        ),
      )
    }
    return out
  },
}

/** Drives need somewhere to plug in. */
const storagePorts: Rule = {
  id: 'storage-ports',
  run(b) {
    if (!b.motherboard || b.storage.length === 0) return []
    const out: Issue[] = []
    const m2 = b.storage.filter((s) => s.part.formFactor === 'M.2-2280').reduce((n, s) => n + s.qty, 0)
    const sata = b.storage.filter((s) => s.part.interface === 'SATA').reduce((n, s) => n + s.qty, 0)

    if (m2 > b.motherboard.m2Slots) {
      out.push(
        issue(
          'storage-ports',
          'error',
          'More M.2 drives than the board has slots',
          `${m2} M.2 drives selected but ${b.motherboard.model} has ${b.motherboard.m2Slots} M.2 slot${b.motherboard.m2Slots === 1 ? '' : 's'}.`,
          [b.motherboard.id, ...b.storage.map((s) => s.part.id)],
          ['storage', 'motherboard'],
        ),
      )
    }
    if (sata > b.motherboard.sataPorts) {
      out.push(
        issue(
          'storage-ports',
          'error',
          'More SATA drives than the board has ports',
          `${sata} SATA drives selected but ${b.motherboard.model} has ${b.motherboard.sataPorts} SATA ports.`,
          [b.motherboard.id, ...b.storage.map((s) => s.part.id)],
          ['storage', 'motherboard'],
        ),
      )
    }
    return out
  },
}

/** …and somewhere to physically mount. */
const driveBays: Rule = {
  id: 'drive-bays',
  run(b) {
    if (!b.case || b.storage.length === 0) return []
    const out: Issue[] = []
    const big = b.storage.filter((s) => s.part.formFactor === '3.5').reduce((n, s) => n + s.qty, 0)
    const small = b.storage.filter((s) => s.part.formFactor === '2.5').reduce((n, s) => n + s.qty, 0)

    if (big > b.case.bays35) {
      out.push(
        issue(
          'drive-bays',
          'error',
          'Not enough 3.5" drive bays',
          `${big} 3.5" drives selected but ${b.case.model} has ${b.case.bays35} 3.5" bay${b.case.bays35 === 1 ? '' : 's'}.`,
          [b.case.id],
          ['storage', 'case'],
        ),
      )
    }
    // 3.5" bays generally accept a 2.5" drive with the right screw holes.
    const smallCapacity = b.case.bays25 + Math.max(0, b.case.bays35 - big)
    if (small > smallCapacity) {
      out.push(
        issue(
          'drive-bays',
          'error',
          'Not enough 2.5" drive mounts',
          `${small} 2.5" drives selected but ${b.case.model} has room for ${smallCapacity} after the other drives are installed.`,
          [b.case.id],
          ['storage', 'case'],
        ),
      )
    }
    return out
  },
}

/** No integrated graphics and no card means no picture. */
const displayOutput: Rule = {
  id: 'display-output',
  run(b) {
    if (!b.cpu || b.gpu) return []
    if (b.cpu.integratedGraphics) return []
    return [
      issue(
        'display-output',
        'error',
        'No way to get a picture out of this build',
        `${b.cpu.model} has no integrated graphics, so a video card is required.`,
        [b.cpu.id],
        ['cpu', 'gpu'],
      ),
    ]
  },
}

/** Nudge toward a complete build without shouting about it. */
const completeness: Rule = {
  id: 'completeness',
  run(b) {
    const missing: Category[] = []
    if (!b.cpu) missing.push('cpu')
    if (!b.motherboard) missing.push('motherboard')
    if (b.memory.length === 0) missing.push('memory')
    if (b.storage.length === 0) missing.push('storage')
    if (!b.psu) missing.push('psu')
    if (!b.case) missing.push('case')
    if (missing.length === 0) return []

    const labels: Record<string, string> = {
      cpu: 'a CPU',
      motherboard: 'a motherboard',
      memory: 'memory',
      storage: 'storage',
      psu: 'a power supply',
      case: 'a case',
    }
    return [
      issue(
        'completeness',
        'info',
        'Build is not complete yet',
        `Still needed: ${missing.map((m) => labels[m]).join(', ')}.`,
        [],
        missing,
      ),
    ]
  },
}

export const RULES: Rule[] = [
  cpuSocket,
  chipsetFamily,
  memoryType,
  memoryCapacity,
  memorySpeed,
  moboCaseFit,
  gpuClearance,
  coolerClearance,
  coolerSocket,
  radiatorFit,
  coolerCapacity,
  coolerPresent,
  ramClearance,
  psuCapacity,
  psuConnectors,
  psuCaseFit,
  storagePorts,
  driveBays,
  displayOutput,
  completeness,
]
