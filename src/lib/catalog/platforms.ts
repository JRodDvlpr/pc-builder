import type { CpuFamily, MemoryType, Socket } from './types'

/**
 * Which CPU families each chipset accepts.
 *
 * Socket match is necessary but not sufficient: AM4 spans Zen1 through Zen3 and
 * an early B450 board will not post with a 5800X3D without a BIOS update, while
 * LGA1700 covers three Intel generations with the same physical socket. Encoding
 * it per chipset lets rule `chipset-cpu-family` give a precise answer instead of
 * a vague "check your BIOS".
 */
export interface ChipsetInfo {
  socket: Socket
  families: CpuFamily[]
  memoryType: MemoryType
  /** Chipsets that need a BIOS flash for the newest family they support. */
  biosUpdateFor?: CpuFamily[]
  tier: 'entry' | 'mainstream' | 'high-end'
}

export const CHIPSETS: Record<string, ChipsetInfo> = {
  // AMD AM5
  X870E: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', tier: 'high-end' },
  X870: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', tier: 'high-end' },
  X670E: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', biosUpdateFor: ['Zen5'], tier: 'high-end' },
  X670: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', biosUpdateFor: ['Zen5'], tier: 'high-end' },
  B850: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', tier: 'mainstream' },
  B650E: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', biosUpdateFor: ['Zen5'], tier: 'mainstream' },
  B650: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', biosUpdateFor: ['Zen5'], tier: 'mainstream' },
  B840: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', tier: 'entry' },
  A620: { socket: 'AM5', families: ['Zen4', 'Zen5'], memoryType: 'DDR5', biosUpdateFor: ['Zen5'], tier: 'entry' },

  // AMD AM4
  X570: { socket: 'AM4', families: ['Zen3'], memoryType: 'DDR4', tier: 'high-end' },
  B550: { socket: 'AM4', families: ['Zen3'], memoryType: 'DDR4', tier: 'mainstream' },
  A520: { socket: 'AM4', families: ['Zen3'], memoryType: 'DDR4', tier: 'entry' },
  B450: { socket: 'AM4', families: ['Zen3'], memoryType: 'DDR4', biosUpdateFor: ['Zen3'], tier: 'entry' },

  // Intel LGA1700 — DDR4 and DDR5 board variants exist per chipset, so the
  // board's own memoryType field wins; this is the common-case default.
  Z790: {
    socket: 'LGA1700',
    families: ['AlderLake', 'RaptorLake', 'RaptorLakeRefresh'],
    memoryType: 'DDR5',
    tier: 'high-end',
  },
  Z690: {
    socket: 'LGA1700',
    families: ['AlderLake', 'RaptorLake', 'RaptorLakeRefresh'],
    memoryType: 'DDR5',
    biosUpdateFor: ['RaptorLake', 'RaptorLakeRefresh'],
    tier: 'high-end',
  },
  B760: {
    socket: 'LGA1700',
    families: ['AlderLake', 'RaptorLake', 'RaptorLakeRefresh'],
    memoryType: 'DDR5',
    tier: 'mainstream',
  },
  H770: {
    socket: 'LGA1700',
    families: ['AlderLake', 'RaptorLake', 'RaptorLakeRefresh'],
    memoryType: 'DDR5',
    tier: 'mainstream',
  },
  B660: {
    socket: 'LGA1700',
    families: ['AlderLake', 'RaptorLake', 'RaptorLakeRefresh'],
    memoryType: 'DDR4',
    biosUpdateFor: ['RaptorLake', 'RaptorLakeRefresh'],
    tier: 'mainstream',
  },
  H610: {
    socket: 'LGA1700',
    families: ['AlderLake', 'RaptorLake', 'RaptorLakeRefresh'],
    memoryType: 'DDR4',
    tier: 'entry',
  },

  // Intel LGA1851
  Z890: { socket: 'LGA1851', families: ['ArrowLake'], memoryType: 'DDR5', tier: 'high-end' },
  B860: { socket: 'LGA1851', families: ['ArrowLake'], memoryType: 'DDR5', tier: 'mainstream' },
  H810: { socket: 'LGA1851', families: ['ArrowLake'], memoryType: 'DDR5', tier: 'entry' },
}

/** Human-readable label for a CPU family, used in compatibility messages. */
export const FAMILY_LABELS: Record<CpuFamily, string> = {
  Zen3: 'Ryzen 5000 (Zen 3)',
  Zen4: 'Ryzen 7000 (Zen 4)',
  Zen5: 'Ryzen 9000 (Zen 5)',
  AlderLake: 'Core 12th gen (Alder Lake)',
  RaptorLake: 'Core 13th gen (Raptor Lake)',
  RaptorLakeRefresh: 'Core 14th gen (Raptor Lake Refresh)',
  ArrowLake: 'Core Ultra 200S (Arrow Lake)',
}

export function chipsetInfo(chipset: string): ChipsetInfo | undefined {
  return CHIPSETS[chipset.toUpperCase()]
}
