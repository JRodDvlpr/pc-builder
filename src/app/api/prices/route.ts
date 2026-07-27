import { NextResponse } from 'next/server'

import { needsRefresh, readPrices, refreshInBackground } from '@/lib/scrape/cache'
import type { PriceResponse } from '@/lib/scrape/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Bound the work a single request can trigger. */
const MAX_PARTS = 120

/**
 * Answers from cache immediately and schedules any stale parts for a background
 * scrape. The response never waits on a retailer, so the part table stays
 * responsive whether Newegg is fast, slow, or blocking us.
 */
export async function POST(request: Request) {
  let partIds: string[] = []
  try {
    const body = (await request.json()) as { partIds?: unknown }
    if (Array.isArray(body.partIds)) {
      partIds = body.partIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_PARTS)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (partIds.length === 0) {
    return NextResponse.json({ prices: {} } satisfies PriceResponse)
  }

  try {
    const prices = readPrices(partIds)

    if (process.env.PC_BUILDER_DISABLE_SCRAPE !== '1') {
      const stale = needsRefresh(partIds)
      if (stale.length > 0) refreshInBackground(stale)
    }

    return NextResponse.json({ prices } satisfies PriceResponse, {
      headers: { 'cache-control': 'no-store' },
    })
  } catch (err) {
    // A database problem must not take the builder down — the client falls back
    // to catalog seed prices when the response is not ok.
    console.error('[api/prices]', err)
    return NextResponse.json({ error: 'Price lookup failed' }, { status: 500 })
  }
}
