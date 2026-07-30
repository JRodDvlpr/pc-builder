import { describe, expect, it } from 'vitest'

import { CATALOG, getPart } from '@/lib/catalog'
import type { Gpu } from '@/lib/catalog/types'

/**
 * Catalog coverage and internal consistency for video cards.
 *
 * The RTX 30 series was almost entirely missing — one 3060 out of the whole
 * Ampere generation — which a user with a 3090 Founders Edition found by not
 * being able to select the card they already own. Reusing an existing GPU is one
 * of the most common reasons to plan a build at all, so a generation-sized hole
 * is worth a test rather than another bug report.
 */

const gpus = CATALOG.gpu

function generation(re: RegExp): Gpu[] {
  return gpus.filter((g) => re.test(g.model))
}

describe('generation coverage', () => {
  it.each([
    ['RTX 50', /RTX 50\d0/],
    ['RTX 40', /RTX 40\d0/],
    ['RTX 30', /RTX 30\d0/],
    ['RX 9000', /RX 9\d{3}/],
    ['RX 7000', /RX 7\d{3}/],
  ])('stocks a usable range of %s cards', (_label, re) => {
    expect(generation(re).length).toBeGreaterThanOrEqual(8)
  })

  it('covers every tier of the RTX 30 series', () => {
    // A build planner is only useful for an upgrade if the card you already own
    // is in it, and Ampere is still very widely owned.
    for (const tier of ['3050', '3060', '3060 Ti', '3070', '3070 Ti', '3080', '3080 Ti', '3090']) {
      const found = gpus.filter((g) => g.model.includes(`RTX ${tier}`))
      expect(found.length, `no RTX ${tier} in the catalog`).toBeGreaterThan(0)
    }
  })

  it('includes the Ampere Founders Editions', () => {
    // These are the reference cards; someone who owns one owns exactly this,
    // not a partner board with different dimensions and power.
    for (const tier of ['3060 Ti', '3070', '3070 Ti', '3080', '3080 Ti', '3090']) {
      const fe = gpus.find((g) => g.model === `GeForce RTX ${tier} Founders Edition`)
      expect(fe, `no RTX ${tier} Founders Edition`).toBeDefined()
      expect(fe!.brand).toBe('NVIDIA')
    }
  })
})

describe('the RTX 3090 Founders Edition', () => {
  const fe = getPart('gpu-3090-fe') as Gpu | undefined

  it('is in the catalog', () => {
    expect(fe).toBeDefined()
  })

  it('has the specs that decide whether a build works', () => {
    expect(fe!.vramGb).toBe(24)
    expect(fe!.tdp).toBe(350)
    expect(fe!.slotWidth).toBe(3)
    // 313mm is long enough to be excluded by small cases, so the number has to
    // be right for the clearance rule to mean anything.
    expect(fe!.lengthMm).toBe(313)
  })

  it('asks for the two 8-pin cables the PSU actually has to supply', () => {
    /*
     * The card's own socket is NVIDIA's 12-pin Microfit, which predates 12VHPWR
     * and which no PSU has ever provided natively — every Ampere FE shipped with
     * an adapter. Recording the socket would tell a buyer to look for a cable
     * that does not exist; recording the cables tells them what to check for.
     */
    expect(fe!.powerConnectors).toEqual({ pcie8: 2 })
  })
})

describe('internal consistency', () => {
  it('gives every card the fields the compatibility rules read', () => {
    for (const g of gpus) {
      expect(g.lengthMm, `${g.id} lengthMm`).toBeGreaterThan(100)
      expect(g.slotWidth, `${g.id} slotWidth`).toBeGreaterThanOrEqual(1)
      expect(g.tdp, `${g.id} tdp`).toBeGreaterThan(0)
      expect(g.recommendedPsuW, `${g.id} recommendedPsuW`).toBeGreaterThan(g.tdp)
      expect(g.vramGb, `${g.id} vramGb`).toBeGreaterThan(0)
      expect(g.outputs.length, `${g.id} outputs`).toBeGreaterThan(0)
    }
  })

  it('can power every card from the connectors it declares', () => {
    for (const g of gpus) {
      const { pcie8 = 0, pcie12vhpwr = 0 } = g.powerConnectors
      // 75W from the slot, 150W per 8-pin, 600W from a 12VHPWR.
      const available = 75 + pcie8 * 150 + pcie12vhpwr * 600
      expect(available, `${g.id} declares too little power for ${g.tdp}W`).toBeGreaterThanOrEqual(
        g.tdp,
      )
    }
  })

  it('uses unique ids', () => {
    const ids = gpus.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
