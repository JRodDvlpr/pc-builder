'use client'

import { useEffect, useRef } from 'react'

import type { PriceResponse } from '../scrape/types'
import { useBuild } from './store'

/**
 * Fetch prices for a set of parts, once each.
 *
 * The API always answers from cache and refreshes in the background, so this
 * can be called freely as the user scrolls the picker — parts already requested
 * are skipped, and results stream into the store to fill skeletons in place.
 *
 * Deliberately no AbortController: aborting an in-flight POST truncates the
 * request body, which the server then sees as malformed JSON. These requests
 * are cheap and the store update is idempotent, so a late response is simply
 * ignored rather than cancelled.
 */
export function usePrices(partIds: string[]) {
  const setPrices = useBuild((s) => s.setPrices)
  const markLoading = useBuild((s) => s.markLoading)
  const clearLoading = useBuild((s) => s.clearLoading)
  const requested = useRef(new Set<string>())

  useEffect(() => {
    const pending = partIds.filter((id) => id && !requested.current.has(id))
    if (pending.length === 0) return
    for (const id of pending) requested.current.add(id)

    markLoading(pending)

    fetch('/api/prices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partIds: pending }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<PriceResponse>) : null))
      .then((data) => {
        // Applied even if the picker has moved on: the result is still correct
        // for these ids, and dropping it would strand them in the loading set.
        if (data?.prices) setPrices(data.prices)
        else clearLoading(pending)
      })
      .catch(() => {
        // Offline or the route failed — line items keep their seed prices.
        // Clear these ids so a later render can try again.
        for (const id of pending) requested.current.delete(id)
        clearLoading(pending)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partIds.join(',')])
}
