'use client'

import { create } from 'zustand'

import { getPart } from '../catalog'
import type { Category } from '../catalog/types'
import type { PriceInfo } from '../scrape/types'
import { decodeBuild, encodeBuild } from './url'
import { emptyBuild, isMulti, type BuildSelection } from './types'

interface BuildState {
  selection: BuildSelection
  /** Prices keyed by part id, filled in as the API answers. */
  prices: Record<string, PriceInfo>
  pricesLoading: Set<string>
  /** Category whose picker is open, or null. */
  openPicker: Category | null
  /** When set, the picker replaces this specific entry instead of appending. */
  replacingPartId: string | null
  hideIncompatible: boolean

  addPart: (partId: string) => void
  replacePart: (oldPartId: string, newPartId: string) => void
  removePart: (category: Category, partId: string) => void
  setQty: (category: Category, partId: string, qty: number) => void
  setOwned: (category: Category, partId: string, owned: boolean) => void
  /** Pass null to drop the override and go back to the market price. */
  setCustomPrice: (category: Category, partId: string, price: number | null) => void
  clear: () => void
  loadFrom: (encoded: string | null) => void

  openPickerFor: (category: Category, replacingPartId?: string) => void
  closePicker: () => void
  setHideIncompatible: (v: boolean) => void

  setPrices: (prices: Record<string, PriceInfo>) => void
  markLoading: (partIds: string[]) => void
  clearLoading: (partIds: string[]) => void
}

/** Keep the address bar in step without pushing a history entry per click. */
function syncUrl(selection: BuildSelection) {
  if (typeof window === 'undefined') return
  const encoded = encodeBuild(selection)
  const url = new URL(window.location.href)
  if (encoded) url.searchParams.set('b', encoded)
  else url.searchParams.delete('b')
  window.history.replaceState(null, '', url)
}

export const useBuild = create<BuildState>((set, get) => ({
  selection: emptyBuild(),
  prices: {},
  pricesLoading: new Set(),
  openPicker: null,
  replacingPartId: null,
  hideIncompatible: true,

  addPart(partId) {
    const part = getPart(partId)
    if (!part) return
    const selection = structuredClone(get().selection)
    const bucket = selection[part.category]

    if (!isMulti(part.category)) {
      selection[part.category] = [{ partId, qty: 1 }]
    } else {
      const existing = bucket.find((i) => i.partId === partId)
      if (existing) existing.qty += 1
      else bucket.push({ partId, qty: 1 })
    }
    syncUrl(selection)
    set({ selection, openPicker: null, replacingPartId: null })
  },

  replacePart(oldPartId, newPartId) {
    const oldPart = getPart(oldPartId)
    const newPart = getPart(newPartId)
    if (!oldPart || !newPart || oldPart.category !== newPart.category) return
    const selection = structuredClone(get().selection)
    const bucket = selection[oldPart.category]
    const index = bucket.findIndex((i) => i.partId === oldPartId)
    if (index === -1) return
    bucket[index] = { partId: newPartId, qty: bucket[index].qty }
    syncUrl(selection)
    set({ selection, openPicker: null, replacingPartId: null })
  },

  removePart(category, partId) {
    const selection = structuredClone(get().selection)
    selection[category] = selection[category].filter((i) => i.partId !== partId)
    syncUrl(selection)
    set({ selection })
  },

  setQty(category, partId, qty) {
    const selection = structuredClone(get().selection)
    const item = selection[category].find((i) => i.partId === partId)
    if (!item) return
    if (qty < 1) {
      selection[category] = selection[category].filter((i) => i.partId !== partId)
    } else {
      item.qty = Math.min(qty, 99)
    }
    syncUrl(selection)
    set({ selection })
  },

  setOwned(category, partId, owned) {
    const selection = structuredClone(get().selection)
    const item = selection[category].find((i) => i.partId === partId)
    if (!item) return
    if (owned) item.owned = true
    else delete item.owned
    syncUrl(selection)
    set({ selection })
  },

  setCustomPrice(category, partId, price) {
    const selection = structuredClone(get().selection)
    const item = selection[category].find((i) => i.partId === partId)
    if (!item) return
    if (price === null || !Number.isFinite(price) || price < 0) {
      delete item.customPrice
    } else {
      // Two decimals is as precise as money gets here, and the ceiling keeps a
      // stray keypress from turning the total into scientific notation.
      item.customPrice = Math.min(Math.round(price * 100) / 100, 100_000)
    }
    syncUrl(selection)
    set({ selection })
  },

  clear() {
    const selection = emptyBuild()
    syncUrl(selection)
    set({ selection })
  },

  loadFrom(encoded) {
    set({ selection: decodeBuild(encoded) })
  },

  openPickerFor(category, replacingPartId) {
    set({ openPicker: category, replacingPartId: replacingPartId ?? null })
  },

  closePicker() {
    set({ openPicker: null, replacingPartId: null })
  },

  setHideIncompatible(v) {
    set({ hideIncompatible: v })
  },

  setPrices(prices) {
    set((state) => {
      const loading = new Set(state.pricesLoading)
      for (const id of Object.keys(prices)) loading.delete(id)
      return { prices: { ...state.prices, ...prices }, pricesLoading: loading }
    })
  },

  markLoading(partIds) {
    set((state) => {
      const loading = new Set(state.pricesLoading)
      for (const id of partIds) loading.add(id)
      return { pricesLoading: loading }
    })
  },

  clearLoading(partIds) {
    set((state) => {
      const loading = new Set(state.pricesLoading)
      for (const id of partIds) loading.delete(id)
      return { pricesLoading: loading }
    })
  },
}))
