import type { PowerEstimate, PowerLine, ResolvedBuild } from './types'

/**
 * Per-component draw figures, in watts.
 *
 * These are deliberately conservative. A PSU that is merely adequate on paper
 * browns out on GPU transients, so the estimate errs high and the recommendation
 * adds headroom on top of that.
 */
const MOBO_BASE: Record<string, number> = {
  'E-ATX': 60,
  ATX: 50,
  'Micro-ATX': 40,
  'Mini-ITX': 30,
}

const DIMM_WATTS = 3
const NVME_WATTS = 8
const SATA_SSD_WATTS = 3
const HDD_WATTS = 9
const FAN_WATTS = 2
const AIO_PUMP_WATTS = 10

/** CPU boost draw exceeds nominal TDP; used when the part has no rated turbo power. */
const CPU_TDP_MULTIPLIER = 1.25
/** GPUs routinely run above their board power rating under load. */
const GPU_TDP_MULTIPLIER = 1.15
/** Headroom applied to the estimate to arrive at a recommended PSU size. */
const PSU_HEADROOM = 1.4

export function estimatePower(build: ResolvedBuild, psuWattage?: number): PowerEstimate {
  const breakdown: PowerLine[] = []

  if (build.cpu) {
    const watts = build.cpu.maxTurboPower ?? Math.round(build.cpu.tdp * CPU_TDP_MULTIPLIER)
    breakdown.push({ label: build.cpu.model, watts, category: 'cpu' })
  }

  if (build.gpu) {
    breakdown.push({
      label: build.gpu.model,
      watts: Math.round(build.gpu.tdp * GPU_TDP_MULTIPLIER),
      category: 'gpu',
    })
  }

  if (build.motherboard) {
    breakdown.push({
      label: `${build.motherboard.formFactor} board + chipset`,
      watts: MOBO_BASE[build.motherboard.formFactor] ?? 50,
      category: 'motherboard',
    })
  }

  const dimms = build.memory.reduce((n, m) => n + m.part.moduleCount * m.qty, 0)
  if (dimms > 0) {
    breakdown.push({
      label: `${dimms} memory module${dimms === 1 ? '' : 's'}`,
      watts: dimms * DIMM_WATTS,
      category: 'memory',
    })
  }

  const driveWatts = build.storage.reduce((sum, s) => {
    const each =
      s.part.formFactor === '3.5'
        ? HDD_WATTS
        : s.part.interface === 'NVMe'
          ? NVME_WATTS
          : SATA_SSD_WATTS
    return sum + each * s.qty
  }, 0)
  if (driveWatts > 0) {
    const count = build.storage.reduce((n, s) => n + s.qty, 0)
    breakdown.push({
      label: `${count} drive${count === 1 ? '' : 's'}`,
      watts: driveWatts,
      category: 'storage',
    })
  }

  // Case fans the user added explicitly, plus whatever the case ships with.
  const addedFans = build.fan.reduce((n, f) => n + f.part.quantity * f.qty, 0)
  const includedFans = build.case?.includedFans ?? 0
  const totalFans = addedFans + includedFans
  if (totalFans > 0) {
    breakdown.push({
      label: `${totalFans} case fan${totalFans === 1 ? '' : 's'}`,
      watts: totalFans * FAN_WATTS,
      category: 'fan',
    })
  }

  if (build.cooler) {
    const watts =
      build.cooler.type === 'aio'
        ? AIO_PUMP_WATTS + build.cooler.fanCount * FAN_WATTS
        : build.cooler.fanCount * FAN_WATTS
    breakdown.push({
      label: build.cooler.type === 'aio' ? 'AIO pump + fans' : 'Cooler fans',
      watts,
      category: 'cooler',
    })
  }

  // Monitors draw from the wall, not from the PSU, so they are excluded here.

  const totalWatts = breakdown.reduce((sum, line) => sum + line.watts, 0)
  const recommendedPsuW = Math.ceil((totalWatts * PSU_HEADROOM) / 50) * 50

  return {
    totalWatts,
    breakdown,
    recommendedPsuW,
    loadPct: psuWattage ? Math.round((totalWatts / psuWattage) * 100) : null,
  }
}
