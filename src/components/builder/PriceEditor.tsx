'use client'

import { useEffect, useRef, useState } from 'react'

import { useBuild } from '@/lib/build/store'
import { formatUsd } from '@/lib/build/total'
import type { Category } from '@/lib/catalog/types'
import { Icons } from '@/components/ui/icons'
import { cx } from '@/components/ui/primitives'

/**
 * Inline editor for a hand-entered unit price.
 *
 * Opens in place of the price rather than in a dialog: changing a number you are
 * looking at should not move your eyes anywhere else, and the running total sits
 * a few centimetres away so the effect is visible as you type. Enter and blur
 * commit, Escape abandons — the conventions people already have for a cell they
 * clicked into.
 */
export function PriceEditor({
  category,
  partId,
  current,
  onClose,
}: {
  category: Category
  partId: string
  /** Seeded into the field so a small correction does not mean retyping. */
  current: number
  onClose: () => void
}) {
  const setCustomPrice = useBuild((s) => s.setCustomPrice)
  const [value, setValue] = useState(current.toFixed(2))
  const inputRef = useRef<HTMLInputElement>(null)
  // Blur fires while committing too; without this the commit runs twice.
  const done = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function commit() {
    if (done.current) return
    done.current = true
    const parsed = Number.parseFloat(value)
    // An empty or unreadable field means "never mind", not "make it zero" —
    // zeroing a price silently understates the total, which is the one thing
    // this whole feature exists to get right.
    if (value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
      setCustomPrice(category, partId, parsed)
    }
    onClose()
  }

  function cancel() {
    done.current = true
    onClose()
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="relative inline-flex items-center">
        <span className="pointer-events-none absolute left-1.5 text-[11px] text-text-muted">$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
            // The row behind this opens the part picker on click; without this a
            // keystroke would bubble out and swap the part mid-edit.
            e.stopPropagation()
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Custom price"
          className="tnum h-7 w-[72px] rounded-md border border-accent bg-surface-2 pr-1.5 pl-4 text-right text-[13px] text-text outline-none"
        />
      </span>
    </span>
  )
}

/**
 * The price as displayed once the user has had their say.
 *
 * A custom price and a scraped one must not look alike — the whole point is that
 * one is the user's own figure — so it carries a pencil and drops the
 * provenance dot that would imply a retailer stood behind it.
 */
export function CustomPrice({
  amount,
  owned,
  onEdit,
  onReset,
  label,
}: {
  amount: number
  owned: boolean
  onEdit: () => void
  onReset: () => void
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        className="inline-flex items-center gap-1 rounded px-0.5 text-accent transition-colors hover:text-accent-hover"
        aria-label={`Edit price for ${label}`}
      >
        <Icons.pencil className="h-2.5 w-2.5 shrink-0" />
        <span className={cx('tnum text-[13px] font-medium', owned && 'line-through opacity-60')}>
          {formatUsd(amount)}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onReset()
        }}
        className="-m-2 inline-flex h-8 w-8 items-center justify-center text-text-muted transition-colors hover:text-text sm:m-0 sm:h-auto sm:w-auto"
        aria-label={`Use the market price for ${label}`}
      >
        <Icons.undo className="h-3 w-3" />
      </button>
    </span>
  )
}
