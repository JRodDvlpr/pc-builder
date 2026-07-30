import { describe, expect, it } from 'vitest'

import { getPart } from '@/lib/catalog'
import { buildLines, buildTotal, ownedTotal } from '@/lib/build/total'
import { emptyBuild, type BuildSelection } from '@/lib/build/types'
import { decodeBuild, encodeBuild } from '@/lib/build/url'
import type { PriceInfo } from '@/lib/scrape/types'

/**
 * Parts you already own, and prices you set yourself.
 *
 * The number that matters when you are about to spend money is what is left to
 * buy — a build sheet that keeps charging you for the drive already in your
 * machine is telling you the wrong thing.
 */

function selection(items: Partial<BuildSelection>): BuildSelection {
  return { ...emptyBuild(), ...items }
}

function priced(partId: string, price: number): Record<string, PriceInfo> {
  return {
    [partId]: { partId, price, source: 'live', confidence: 'single', fetchedAt: Date.now(), offers: [] },
  }
}

describe('parts the user already owns', () => {
  it('leaves an owned part out of the total', () => {
    const cpu = getPart('cpu-9800x3d')!
    const lines = buildLines(
      selection({ cpu: [{ partId: cpu.id, qty: 1, owned: true }] }),
      priced(cpu.id, 479),
    )

    expect(buildTotal(lines)).toBe(0)
    expect(ownedTotal(lines)).toBe(479)
  })

  it('still counts the parts that are not owned', () => {
    const cpu = getPart('cpu-9800x3d')!
    const ssd = getPart('ssd-990pro-1tb')!
    const lines = buildLines(
      selection({
        cpu: [{ partId: cpu.id, qty: 1, owned: true }],
        storage: [{ partId: ssd.id, qty: 1 }],
      }),
      { ...priced(cpu.id, 479), ...priced(ssd.id, 120) },
    )

    expect(buildTotal(lines)).toBe(120)
    expect(ownedTotal(lines)).toBe(479)
  })

  it('respects quantity on both sides of the split', () => {
    const ssd = getPart('ssd-990pro-1tb')!
    const lines = buildLines(
      selection({ storage: [{ partId: ssd.id, qty: 3, owned: true }] }),
      priced(ssd.id, 100),
    )

    expect(buildTotal(lines)).toBe(0)
    expect(ownedTotal(lines)).toBe(300)
  })
})

describe('a price the user set by hand', () => {
  it('overrides the scraped price', () => {
    const cpu = getPart('cpu-9800x3d')!
    const lines = buildLines(
      selection({ cpu: [{ partId: cpu.id, qty: 1, customPrice: 399.99 }] }),
      priced(cpu.id, 479),
    )

    expect(lines[0].unitPrice).toBe(399.99)
    expect(lines[0].custom).toBe(true)
    expect(buildTotal(lines)).toBe(399.99)
  })

  it('applies per unit, not per line', () => {
    const ssd = getPart('ssd-990pro-1tb')!
    const lines = buildLines(
      selection({ storage: [{ partId: ssd.id, qty: 2, customPrice: 50 }] }),
      priced(ssd.id, 120),
    )

    expect(buildTotal(lines)).toBe(100)
  })

  it('combines with owned: recorded, but not charged for', () => {
    // What you paid for a part you already have is worth keeping; it just is
    // not money you are about to spend again.
    const cpu = getPart('cpu-9800x3d')!
    const lines = buildLines(
      selection({ cpu: [{ partId: cpu.id, qty: 1, owned: true, customPrice: 250 }] }),
      priced(cpu.id, 479),
    )

    expect(buildTotal(lines)).toBe(0)
    expect(ownedTotal(lines)).toBe(250)
  })

  it('falls back to the market price once the override is dropped', () => {
    const cpu = getPart('cpu-9800x3d')!
    const lines = buildLines(selection({ cpu: [{ partId: cpu.id, qty: 1 }] }), priced(cpu.id, 479))

    expect(lines[0].custom).toBe(false)
    expect(buildTotal(lines)).toBe(479)
  })
})

describe('sharing a build that has both', () => {
  it('round-trips owned and custom price through the URL', () => {
    const before = selection({
      cpu: [{ partId: 'cpu-9800x3d', qty: 1, owned: true, customPrice: 399.99 }],
      storage: [{ partId: 'ssd-990pro-1tb', qty: 2, customPrice: 88.5 }],
      memory: [{ partId: 'mem-tz5-6000c30-32', qty: 1, owned: true }],
    })

    const after = decodeBuild(encodeBuild(before))

    expect(after.cpu[0]).toEqual({ partId: 'cpu-9800x3d', qty: 1, owned: true, customPrice: 399.99 })
    expect(after.storage[0]).toEqual({ partId: 'ssd-990pro-1tb', qty: 2, customPrice: 88.5 })
    expect(after.memory[0]).toEqual({ partId: 'mem-tz5-6000c30-32', qty: 1, owned: true })
  })

  it('keeps a plain part id encoding exactly as it did before', () => {
    // Links shared before any of this existed must still open the same build.
    expect(encodeBuild(selection({ cpu: [{ partId: 'cpu-9800x3d', qty: 1 }] }))).toBe('cpu-9800x3d')
    expect(decodeBuild('cpu-9800x3d').cpu[0]).toEqual({ partId: 'cpu-9800x3d', qty: 1 })
  })

  it('omits the markers when there is nothing to say', () => {
    const encoded = encodeBuild(
      selection({ storage: [{ partId: 'ssd-990pro-1tb', qty: 2, owned: false }] }),
    )
    expect(encoded).toBe('ssd-990pro-1tb*2')
  })

  it('ignores a hand-edited price that is out of range', () => {
    // The `b` parameter is user-editable, so a nonsense figure must not be able
    // to poison the total.
    expect(decodeBuild('cpu-9800x3d$999999').cpu[0].customPrice).toBeUndefined()
    expect(decodeBuild('cpu-9800x3d$0').cpu[0].customPrice).toBe(0)
  })

  it('drops a token it cannot parse rather than guessing', () => {
    expect(decodeBuild('cpu-9800x3d$$$!!').cpu).toHaveLength(0)
  })
})
