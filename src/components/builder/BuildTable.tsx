'use client'

import { useBuild } from '@/lib/build/store'
import { buildLines, formatUsd } from '@/lib/build/total'
import { isMulti } from '@/lib/build/types'
import { specSummary } from '@/lib/catalog/specs'
import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/catalog/types'
import type { CompatReport } from '@/lib/compat/types'
import { Icon, Icons } from '@/components/ui/icons'
import { Button, Tooltip, cx } from '@/components/ui/primitives'
import { PriceCell } from './PriceCell'

/**
 * The build itself: one row per category, always all ten visible so the shape of
 * a complete build is obvious from the first render rather than something you
 * discover by scrolling.
 *
 * Layout is `table-fixed` with responsive column widths. Auto table layout sizes
 * columns to their content, which on a phone pushed the price and the row
 * actions clean off the right edge — the two things you most need to see. On
 * narrow screens the dedicated category column collapses and its label moves
 * above the part name instead.
 */
export function BuildTable({ report }: { report: CompatReport }) {
  const selection = useBuild((s) => s.selection)
  const prices = useBuild((s) => s.prices)
  const openPickerFor = useBuild((s) => s.openPickerFor)
  const removePart = useBuild((s) => s.removePart)
  const setQty = useBuild((s) => s.setQty)

  const lines = buildLines(selection, prices)

  // Categories that any error or warning implicates, for the row accent.
  const flagged = new Map<Category, 'error' | 'warning'>()
  for (const issue of report.issues) {
    if (issue.severity === 'info') continue
    for (const c of issue.categories) {
      if (issue.severity === 'error') flagged.set(c, 'error')
      else if (!flagged.has(c)) flagged.set(c, 'warning')
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <table className="w-full table-fixed border-collapse">
        {/*
          Column widths must live here, not on the cells. `table-layout: fixed`
          takes widths from the column elements or the first row — and the first
          row is the `sr-only` thead below, which is absolutely positioned and so
          contributes nothing. Without this colgroup the browser fell back to
          splitting every column equally, which blew the table past the viewport
          on phones. A zero-width first column collapses the category cell, which
          is `display: none` below the `sm` breakpoint.
        */}
        <colgroup>
          <col className="w-0 sm:w-48" />
          <col />
          <col className="w-[80px] sm:w-28" />
          <col className="w-[88px] sm:w-24" />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th>Component</th>
            <th>Selection</th>
            <th>Price</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category]
            const rows = lines.filter((l) => l.category === category)
            const flag = flagged.get(category)

            if (rows.length === 0) {
              return (
                <tr key={category} className="group border-b border-border/60 last:border-0">
                  <td className="p-0 align-middle sm:py-2.5 sm:pr-2 sm:pl-4">
                    <CategoryLabel category={category} flag={flag} />
                  </td>
                  <td colSpan={3} className="py-2 pr-3 pl-3 sm:pr-4 sm:pl-0">
                    <button
                      type="button"
                      onClick={() => openPickerFor(category)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 text-left text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      <Icons.plus className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Choose a {meta.singular}</span>
                      {meta.required && (
                        <span className="ml-auto shrink-0 text-[11px] tracking-wide uppercase opacity-60">
                          required
                        </span>
                      )}
                    </button>
                  </td>
                </tr>
              )
            }

            return rows.map((line, index) => (
              <tr key={`${category}-${line.part.id}`} className="border-b border-border/60 last:border-0">
                <td className="p-0 align-top sm:py-2.5 sm:pr-2 sm:pl-4">
                  {index === 0 ? (
                    <CategoryLabel category={category} flag={flag} />
                  ) : (
                    <span className="sr-only">{meta.label}</span>
                  )}
                </td>

                <td className="min-w-0 py-2.5 pr-2 pl-3 align-top sm:pl-0">
                  {/* The category column is hidden on phones, so the label and
                      its status colour ride along with the part name instead. */}
                  <p className="mb-0.5 flex items-center gap-1.5 sm:hidden">
                    <Icon
                      name={meta.icon as never}
                      className={cx(
                        'h-3 w-3 shrink-0',
                        flag === 'error'
                          ? 'text-danger'
                          : flag === 'warning'
                            ? 'text-warn'
                            : 'text-text-muted',
                      )}
                    />
                    <span
                      className={cx(
                        'truncate text-[11px] font-medium',
                        flag === 'error'
                          ? 'text-danger'
                          : flag === 'warning'
                            ? 'text-warn'
                            : 'text-text-muted',
                      )}
                    >
                      {meta.label}
                    </span>
                  </p>

                  <button
                    type="button"
                    onClick={() => openPickerFor(category, line.part.id)}
                    className="block w-full text-left"
                  >
                    <p className="truncate text-sm font-medium transition-colors hover:text-accent">
                      <span className="text-text-muted">{line.part.brand}</span> {line.part.model}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-text-muted">
                      {specSummary(line.part)}
                    </p>
                  </button>
                </td>

                <td className="py-2.5 pr-1 text-right align-top sm:pr-2">
                  <PriceCell partId={line.part.id} seedPrice={line.part.seedPrice} />
                  {line.qty > 1 && (
                    <p className="tnum mt-0.5 text-[11px] text-text-muted">
                      ×{line.qty} = {formatUsd(line.lineTotal)}
                    </p>
                  )}
                </td>

                <td className="py-2.5 pr-2 align-top sm:pr-4">
                  <div className="flex items-center justify-end gap-0.5">
                    <Tooltip label="Swap this part" side="top">
                      <button
                        type="button"
                        onClick={() => openPickerFor(category, line.part.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:h-7 sm:w-7"
                        aria-label={`Swap ${line.part.model}`}
                      >
                        <Icons.swap className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Remove" side="top">
                      <button
                        type="button"
                        onClick={() => removePart(category, line.part.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-soft hover:text-danger sm:h-7 sm:w-7"
                        aria-label={`Remove ${line.part.model}`}
                      >
                        <Icons.trash className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </Tooltip>
                  </div>

                  {isMulti(category) && (
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => setQty(category, line.part.id, line.qty - 1)}
                          className="flex h-7 w-6 items-center justify-center text-text-muted transition-colors hover:text-text sm:h-6 sm:w-5"
                          aria-label={`Decrease quantity of ${line.part.model}`}
                        >
                          −
                        </button>
                        <span className="tnum w-4 text-center text-[11px]">{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(category, line.part.id, line.qty + 1)}
                          className="flex h-7 w-6 items-center justify-center text-text-muted transition-colors hover:text-text sm:h-6 sm:w-5"
                          aria-label={`Increase quantity of ${line.part.model}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {isMulti(category) && index === rows.length - 1 && (
                    <div className="mt-1 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openPickerFor(category)}
                        className="h-7 px-1.5 text-[11px] sm:h-6"
                      >
                        <Icons.plus className="h-3 w-3" />
                        Add
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}

function CategoryLabel({ category, flag }: { category: Category; flag?: 'error' | 'warning' }) {
  const meta = CATEGORY_META[category]
  return (
    <span className="hidden items-center gap-2 sm:flex">
      <span
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
          flag === 'error'
            ? 'border-danger/30 bg-danger-soft text-danger'
            : flag === 'warning'
              ? 'border-warn/30 bg-warn-soft text-warn'
              : 'border-border bg-surface-2 text-text-muted',
        )}
      >
        <Icon name={meta.icon as never} className="h-4 w-4" />
      </span>
      <span className="truncate text-[13px] font-medium text-text-secondary">{meta.label}</span>
    </span>
  )
}
