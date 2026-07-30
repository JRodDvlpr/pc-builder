'use client'

import { useState } from 'react'

import { useBuild } from '@/lib/build/store'
import { buildLines, formatUsd } from '@/lib/build/total'
import { isMulti } from '@/lib/build/types'
import { specSummary } from '@/lib/catalog/specs'
import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/catalog/types'
import type { CompatReport } from '@/lib/compat/types'
import { Icon, Icons } from '@/components/ui/icons'
import { Button, Tooltip, cx } from '@/components/ui/primitives'
import { PartImage } from './PartImage'
import { PriceCell } from './PriceCell'
import { CustomPrice, PriceEditor } from './PriceEditor'

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
  const setOwned = useBuild((s) => s.setOwned)
  const setCustomPrice = useBuild((s) => s.setCustomPrice)
  /** Part id whose price is being typed, if any — only ever one at a time. */
  const [editing, setEditing] = useState<string | null>(null)

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
          on phones. The first column is collapsed to zero width on phones rather
          than hidden — a `display: none` cell stops occupying a column slot,
          which shifts every subsequent width onto the wrong column.
        */}
        <colgroup>
          <col className="w-0 sm:w-44" />
          <col />
          <col className="w-[80px] sm:w-32" />
          {/* Wide enough for four 28px actions in a single row from `sm` up:
              4×28 + 3×2 gap = 118px, plus the cell's 20px right padding. The
              phone width is unchanged and deliberately too narrow for that,
              where the 36px touch targets wrap to two rows instead. */}
          <col className="w-[88px] sm:w-40" />
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
                  <td className="p-0 align-middle sm:py-3.5 sm:pr-2 sm:pl-5">
                    <CategoryLabel category={category} flag={flag} />
                  </td>
                  <td colSpan={3} className="py-2.5 pr-3 pl-3 sm:pr-5 sm:pl-0">
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
                <td className="p-0 align-top sm:py-3.5 sm:pr-2 sm:pl-5">
                  {index === 0 ? (
                    <CategoryLabel category={category} flag={flag} />
                  ) : (
                    <span className="sr-only">{meta.label}</span>
                  )}
                </td>

                <td className="min-w-0 py-3 pr-2 pl-3 align-top sm:py-3.5 sm:pl-0">
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
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <PartImage
                      partId={line.part.id}
                      category={category}
                      className="mt-0.5 hidden sm:flex sm:h-12 sm:w-12"
                      iconClassName="h-4 w-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium transition-colors hover:text-accent">
                        <span className="text-text-muted">{line.part.brand}</span> {line.part.model}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-text-muted">
                        {specSummary(line.part)}
                      </span>
                    </span>
                  </button>
                </td>

                <td className="py-3 pr-1 text-right align-top sm:py-3.5 sm:pr-3">
                  {editing === line.part.id ? (
                    <PriceEditor
                      category={category}
                      partId={line.part.id}
                      current={line.unitPrice}
                      onClose={() => setEditing(null)}
                    />
                  ) : line.custom ? (
                    <CustomPrice
                      amount={line.unitPrice}
                      owned={line.owned}
                      label={line.part.model}
                      onEdit={() => setEditing(line.part.id)}
                      onReset={() => setCustomPrice(category, line.part.id, null)}
                    />
                  ) : (
                    <span className={cx('inline-flex', line.owned && 'line-through opacity-60')}>
                      <PriceCell partId={line.part.id} seedPrice={line.part.seedPrice} />
                    </span>
                  )}

                  {line.qty > 1 && (
                    <p className="tnum mt-0.5 text-[11px] text-text-muted">
                      ×{line.qty} = {formatUsd(line.lineTotal)}
                    </p>
                  )}
                  {line.owned && (
                    <p className="mt-0.5 text-[11px] font-medium text-ok">
                      {/* The full phrase wraps to "not in / total" in the 80px
                          price column on a phone; the strikethrough above
                          already carries the meaning there. */}
                      Owned<span className="hidden sm:inline"> · not in total</span>
                    </p>
                  )}
                </td>

                <td className="py-3 pr-2 align-top sm:py-3.5 sm:pr-5">
                  {/* Wraps deliberately: four 36px touch targets do not fit the
                      88px actions column on a phone, and letting them overflow
                      is what pushed the table off-screen once before. Two rows
                      of two is the graceful version of the same thing. */}
                  <div className="flex flex-wrap items-center justify-end gap-0.5">
                    <Tooltip
                      label={
                        line.owned
                          ? 'Already owned — not counted in the total. Click to include it again.'
                          : 'I already own this — leave it out of the total'
                      }
                      side="top"
                    >
                      <button
                        type="button"
                        onClick={() => setOwned(category, line.part.id, !line.owned)}
                        aria-pressed={line.owned}
                        className={cx(
                          'flex h-9 w-9 items-center justify-center rounded-md transition-colors sm:h-7 sm:w-7',
                          line.owned
                            ? 'bg-ok-soft text-ok'
                            : 'text-text-muted hover:bg-surface-2 hover:text-text',
                        )}
                        aria-label={
                          line.owned
                            ? `Include ${line.part.model} in the total`
                            : `Mark ${line.part.model} as already owned`
                        }
                      >
                        <Icons.owned className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Set your own price" side="top">
                      <button
                        type="button"
                        onClick={() => setEditing(line.part.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:h-7 sm:w-7"
                        aria-label={`Set a custom price for ${line.part.model}`}
                      >
                        <Icons.pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </Tooltip>
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
