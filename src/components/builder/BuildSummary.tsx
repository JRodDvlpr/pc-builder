'use client'

import { useState } from 'react'

import { useBuild } from '@/lib/build/store'
import { buildLines, buildTotal, formatUsd } from '@/lib/build/total'
import { countParts, encodeBuild, isEmptyBuild } from '@/lib/build/url'
import type { CompatReport } from '@/lib/compat/types'
import { IssueList } from '@/components/compat/IssueList'
import { WattageMeter } from '@/components/compat/WattageMeter'
import { Icons } from '@/components/ui/icons'
import { Button, cx } from '@/components/ui/primitives'

export function BuildSummary({ report }: { report: CompatReport }) {
  const selection = useBuild((s) => s.selection)
  const prices = useBuild((s) => s.prices)
  const clear = useBuild((s) => s.clear)
  const [copied, setCopied] = useState(false)

  const lines = buildLines(selection, prices)
  const total = buildTotal(lines)
  const empty = isEmptyBuild(selection)
  const partCount = countParts(selection)

  const psu = lines.find((l) => l.category === 'psu')

  async function share() {
    const url = new URL(window.location.href)
    const encoded = encodeBuild(selection)
    if (encoded) url.searchParams.set('b', encoded)
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure origin or denied permission) — the URL is
      // already in the address bar, so there is nothing to recover from.
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-text-muted uppercase">Total</h2>
          <span className="tnum text-[11px] text-text-muted">
            {partCount} part{partCount === 1 ? '' : 's'}
          </span>
        </div>
        <p
          data-testid="build-total"
          className="tnum mt-1.5 text-4xl font-semibold tracking-[-0.02em] tabular-nums"
        >
          {formatUsd(total)}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
          Live prices from Newegg and Amazon where a listing matched; catalog reference
          prices otherwise. Excludes tax and shipping.
        </p>

        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" onClick={share} disabled={empty} className="flex-1">
            {copied ? <Icons.check className="h-3.5 w-3.5" /> : <Icons.link className="h-3.5 w-3.5" />}
            {copied ? 'Link copied' : 'Share build'}
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={empty} aria-label="Clear build">
            <Icons.trash className="h-3.5 w-3.5" />
          </Button>
        </div>
      </section>

      <section
        className={cx(
          'rounded-2xl border bg-surface p-5 shadow-card transition-colors',
          !report.buildable ? 'border-danger/30' : 'border-border',
        )}
      >
        <h2 className="mb-2 text-xs font-semibold tracking-wider text-text-muted uppercase">
          Power
        </h2>
        <WattageMeter
          power={report.power}
          psuWattage={psu ? (psu.part as { wattage?: number }).wattage : undefined}
          psuLabel={psu ? `${psu.part.brand} ${psu.part.model}` : undefined}
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <IssueList report={report} />
      </section>
    </div>
  )
}
