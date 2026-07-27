'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'

import { useBuild } from '@/lib/build/store'
import { buildLines, buildTotal, formatUsd } from '@/lib/build/total'
import { usePrices } from '@/lib/build/usePrices'
import { isEmptyBuild } from '@/lib/build/url'
import { CATALOG_SIZE } from '@/lib/catalog'
import { analyzeSelection } from '@/lib/compat/engine'
import type { CompatReport } from '@/lib/compat/types'
import { BuildSummary } from '@/components/builder/BuildSummary'
import { BuildTable } from '@/components/builder/BuildTable'
import { PartPicker } from '@/components/builder/PartPicker'
import { Icons } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export default function BuilderPage() {
  const selection = useBuild((s) => s.selection)
  const prices = useBuild((s) => s.prices)
  const openPicker = useBuild((s) => s.openPicker)
  const closePicker = useBuild((s) => s.closePicker)
  const loadFrom = useBuild((s) => s.loadFrom)

  // Restore a shared build from ?b= on first paint.
  useEffect(() => {
    loadFrom(new URLSearchParams(window.location.search).get('b'))
  }, [loadFrom])

  const report = useMemo(() => analyzeSelection(selection), [selection])
  const lines = buildLines(selection, prices)
  const total = buildTotal(lines)
  const empty = isEmptyBuild(selection)

  // Keep prices for everything in the build fresh, independent of the picker.
  usePrices(useMemo(() => lines.map((l) => l.part.id), [lines]))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && openPicker) closePicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPicker, closePicker])

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Icons.cpu className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">PC Builder</span>
          </Link>

          <span className="hidden text-[13px] text-text-muted lg:block">
            {CATALOG_SIZE} parts · live compatibility · live prices
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <StatusPill report={report} />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-3 pt-4 pb-28 sm:px-6 lg:pb-10">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
          <div className="min-w-0">
            {openPicker ? (
              <div className="h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-7.5rem)]">
                <PartPicker category={openPicker} />
              </div>
            ) : (
              <>
                {empty && <EmptyState />}
                <BuildTable report={report} />
              </>
            )}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-[4.5rem] lg:self-start">
            <BuildSummary report={report} />
          </aside>
        </div>
      </main>

      {/* Mobile: the total is what you want visible while scrolling. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-3 py-2.5 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-text-muted">Total</p>
            <p className="tnum text-lg leading-tight font-semibold">{formatUsd(total)}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="tnum text-[13px] text-text-secondary">{report.power.totalWatts} W</span>
            <StatusPill report={report} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ report }: { report: CompatReport }) {
  const { errors, warnings } = report
  if (errors.length > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[13px] font-medium text-danger">
        <Icons.alert className="h-3.5 w-3.5" />
        {errors.length} blocker{errors.length === 1 ? '' : 's'}
      </span>
    )
  }
  if (warnings.length > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[13px] font-medium text-warn">
        <Icons.alert className="h-3.5 w-3.5" />
        {warnings.length} warning{warnings.length === 1 ? '' : 's'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok-soft px-2.5 py-1.5 text-[13px] font-medium text-ok">
      <Icons.check className="h-3.5 w-3.5" />
      Compatible
    </span>
  )
}

function EmptyState() {
  const openPickerFor = useBuild((s) => s.openPickerFor)
  const steps = [
    { icon: Icons.cpu, title: 'Start with the CPU', body: 'Everything else follows from the socket you pick.' },
    { icon: Icons.check, title: 'Incompatible parts hide themselves', body: 'Only what fits is listed, with the reason on hover.' },
    { icon: Icons.bolt, title: 'Watch the power budget', body: 'The meter tracks draw against your PSU as you go.' },
  ]

  return (
    <section className="mb-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h1 className="text-lg font-semibold tracking-tight">Build a PC that actually fits together</h1>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-text-secondary">
        Pick parts and every socket, clearance, slot count and watt is checked as you go — before you
        click, not after.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <s.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{s.title}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => openPickerFor('cpu')}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        <Icons.plus className="h-3.5 w-3.5" />
        Pick a CPU to start
      </button>
    </section>
  )
}
