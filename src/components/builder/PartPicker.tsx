'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { useBuild } from '@/lib/build/store'
import { usePrices } from '@/lib/build/usePrices'
import { partsIn } from '@/lib/catalog'
import { FACETS, applyFilters, facetOptions, searchParts, type FilterState } from '@/lib/catalog/filters'
import { SPEC_COLUMNS } from '@/lib/catalog/specs'
import { CATEGORY_META, type Category, type Part } from '@/lib/catalog/types'
import { buildWithout, candidateVerdict, resolveBuild } from '@/lib/compat/engine'
import { Icons } from '@/components/ui/icons'
import { Badge, Button, Tooltip, cx } from '@/components/ui/primitives'
import { PriceCell } from './PriceCell'

const PAGE_SIZE = 60

type SortDir = 'asc' | 'desc'

export function PartPicker({ category }: { category: Category }) {
  const selection = useBuild((s) => s.selection)
  const prices = useBuild((s) => s.prices)
  const replacingPartId = useBuild((s) => s.replacingPartId)
  const hideIncompatible = useBuild((s) => s.hideIncompatible)
  const setHideIncompatible = useBuild((s) => s.setHideIncompatible)
  const addPart = useBuild((s) => s.addPart)
  const replacePart = useBuild((s) => s.replacePart)
  const closePicker = useBuild((s) => s.closePicker)

  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<FilterState>({})
  const [sortKey, setSortKey] = useState<string>('price')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [cursor, setCursor] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const meta = CATEGORY_META[category]
  const columns = SPEC_COLUMNS[category]
  const facets = FACETS[category]
  const allParts = useMemo(() => partsIn(category) as Part[], [category])

  // Evaluate candidates against the build with this category's own pick removed,
  // so swapping a CPU is judged against the board rather than against itself.
  const evalBuild = useMemo(
    () => buildWithout(resolveBuild(selection), category),
    [selection, category],
  )

  const verdicts = useMemo(() => {
    const map = new Map<string, ReturnType<typeof candidateVerdict>>()
    for (const part of allParts) map.set(part.id, candidateVerdict(evalBuild, part))
    return map
  }, [allParts, evalBuild])

  const incompatibleCount = useMemo(
    () => allParts.filter((p) => verdicts.get(p.id)?.severity === 'error').length,
    [allParts, verdicts],
  )

  const filtered = useMemo(() => {
    let list = applyFilters(allParts, category, filters)
    list = searchParts(list, query)
    if (hideIncompatible) list = list.filter((p) => verdicts.get(p.id)?.severity !== 'error')
    return list
  }, [allParts, category, filters, query, hideIncompatible, verdicts])

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey)
    const value = (p: Part): number | string => {
      if (sortKey === 'price') return prices[p.id]?.price ?? p.seedPrice
      if (sortKey === 'name') return `${p.brand} ${p.model}`
      if (!column) return 0
      return column.sortValue ? column.sortValue(p) : column.value(p)
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [filtered, sortKey, sortDir, columns, prices])

  const visible = useMemo(() => sorted.slice(0, limit), [sorted, limit])

  usePrices(useMemo(() => visible.map((p) => p.id), [visible]))

  // Reset paging and the keyboard cursor whenever the result set changes shape.
  useEffect(() => {
    setLimit(PAGE_SIZE)
    setCursor(0)
  }, [query, filters, sortKey, sortDir, hideIncompatible, category])

  useEffect(() => {
    searchRef.current?.focus()
  }, [category])

  function choose(part: Part) {
    if (replacingPartId) replacePart(replacingPartId, part.id)
    else addPart(part.id)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      closePicker()
      return
    }
    if (e.key === '/' && document.activeElement !== searchRef.current) {
      e.preventDefault()
      searchRef.current?.focus()
      return
    }
    const isNav =
      e.key === 'ArrowDown' || e.key === 'ArrowUp' || (e.key === 'j' && e.ctrlKey) || (e.key === 'k' && e.ctrlKey)
    if (isNav) {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1
      setCursor((c) => Math.min(Math.max(c + delta, 0), visible.length - 1))
      requestAnimationFrame(() => {
        listRef.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })
      })
      return
    }
    if (e.key === 'Enter' && visible[cursor]) {
      e.preventDefault()
      choose(visible[cursor])
    }
  }

  function toggleFilter(facetKey: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev }
      const set = new Set(next[facetKey] ?? [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      next[facetKey] = set
      return next
    })
  }

  function sortBy(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : key === 'price' ? 'asc' : 'desc')
    }
  }

  const activeFilterCount = Object.values(filters).reduce((n, s) => n + s.size, 0)

  return (
    <div
      className="animate-slide-up flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={`Choose ${meta.label}`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <Icons.chevron className="hidden h-4 w-4 rotate-180 text-text-muted sm:block" />
          <h2 className="text-sm font-semibold">
            {replacingPartId ? 'Replace' : 'Choose'} {meta.label}
          </h2>
        </div>

        <div className="relative order-last w-full sm:order-none sm:ml-2 sm:w-auto sm:flex-1">
          <Icons.search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${allParts.length} ${meta.label.toLowerCase()}…`}
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-8 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-accent"
          />
        </div>

        <Button
          size="sm"
          variant={showFilters ? 'primary' : 'secondary'}
          onClick={() => setShowFilters((v) => !v)}
          className="lg:hidden"
        >
          <Icons.filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && <span className="tnum">({activeFilterCount})</span>}
        </Button>

        <Button size="sm" variant="ghost" onClick={closePicker} aria-label="Close">
          <Icons.x className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex items-center gap-3 border-b border-border bg-surface-2/50 px-3 py-2 sm:px-4">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] select-none sm:min-h-0">
          <input
            type="checkbox"
            checked={hideIncompatible}
            onChange={(e) => setHideIncompatible(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-text-secondary">Hide incompatible</span>
          {incompatibleCount > 0 && (
            <span className="tnum text-text-muted">({incompatibleCount})</span>
          )}
        </label>

        <span className="tnum ml-auto text-[13px] text-text-muted">
          {sorted.length} of {allParts.length}
        </span>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({})}
            className="text-[13px] text-accent transition-opacity hover:opacity-75"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* `relative` is load-bearing: the filter drawer below is absolutely
          positioned, and without a positioned ancestor it resolved against the
          viewport — covering the page header and clipping off the left edge. */}
      <div className="relative flex min-h-0 flex-1">
        {showFilters && (
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setShowFilters(false)}
            className="absolute inset-0 z-20 bg-black/40 lg:hidden"
          />
        )}
        <aside
          className={cx(
            'w-56 shrink-0 overflow-y-auto border-r border-border p-3',
            showFilters
              ? 'absolute inset-y-0 left-0 z-30 w-64 max-w-[85%] bg-surface shadow-float lg:static lg:z-auto lg:max-w-none lg:shadow-none'
              : 'hidden lg:block',
          )}
        >
          {facets.map((facet) => {
            // Count against everything except this facet, so its own options
            // don't vanish as you tick them.
            const scope = applyFilters(
              searchParts(allParts, query),
              category,
              Object.fromEntries(Object.entries(filters).filter(([k]) => k !== facet.key)),
            )
            const options = facetOptions(scope, facet)
            if (options.length < 2) return null
            return (
              <div key={facet.key} className="mb-4 last:mb-0">
                <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
                  {facet.label}
                </h3>
                <ul className="space-y-0.5">
                  {options.map((opt) => {
                    const checked = filters[facet.key]?.has(opt.value) ?? false
                    return (
                      <li key={opt.value}>
                        <label
                          className={cx(
                            'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] transition-colors sm:min-h-0 sm:py-1',
                            checked ? 'bg-accent-soft text-text' : 'text-text-secondary hover:bg-surface-2',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFilter(facet.key, opt.value)}
                            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 flex-1 truncate">{opt.value}</span>
                          <span className="tnum shrink-0 text-[11px] text-text-muted">{opt.count}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </aside>

        <div ref={listRef} className="min-w-0 flex-1 overflow-y-auto">
          {/* Fixed layout keeps the price column on screen at every width — it
              is the column people scan, so it must never be the one that gets
              pushed off the edge by a long product name. */}
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-[11px] tracking-wider text-text-muted uppercase">
                <SortHeader
                  label="Part"
                  active={sortKey === 'name'}
                  dir={sortDir}
                  onClick={() => sortBy('name')}
                  className="w-[46%] pl-3 sm:pl-4 md:w-[34%]"
                />
                {columns.map((c) => (
                  <SortHeader
                    key={c.key}
                    label={c.label}
                    active={sortKey === c.key}
                    dir={sortDir}
                    numeric={c.numeric}
                    onClick={() => sortBy(c.key)}
                    className="hidden md:table-cell"
                  />
                ))}
                <SortHeader
                  label="Price"
                  active={sortKey === 'price'}
                  dir={sortDir}
                  numeric
                  onClick={() => sortBy('price')}
                  className="w-[26%] md:w-28"
                />
                <th className="w-9 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((part, i) => {
                const verdict = verdicts.get(part.id)
                const blocked = verdict?.severity === 'error'
                const warned = verdict?.severity === 'warning'
                const reason = verdict?.issues[0]
                return (
                  <tr
                    key={part.id}
                    data-cursor={i === cursor ? 'true' : undefined}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(part)}
                    className={cx(
                      'group cursor-pointer border-b border-border/60 transition-colors',
                      i === cursor ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                      blocked && 'opacity-45',
                    )}
                  >
                    <td className="py-2 pr-2 pl-3 sm:pl-4">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] leading-snug font-medium">
                            <span className="text-text-muted">{part.brand}</span> {part.model}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-text-muted md:hidden">
                            {columns.slice(0, 3).map((c) => c.value(part)).join(' · ')}
                          </p>
                          {/* Touch has no hover, so the reason a part does not
                              fit — the whole point of showing it at all — is
                              rendered inline on small screens rather than being
                              locked inside the tooltip. */}
                          {(blocked || warned) && reason && (
                            <p
                              className={cx(
                                'mt-1 text-[11px] leading-snug md:hidden',
                                blocked ? 'text-danger' : 'text-warn',
                              )}
                            >
                              {reason.title}
                            </p>
                          )}
                        </div>
                        {(blocked || warned) && reason && (
                          <Tooltip
                            className="hidden shrink-0 md:inline-flex"
                            label={
                              <span>
                                <span className="block font-medium">{reason.title}</span>
                                <span className="mt-0.5 block text-text-secondary">{reason.detail}</span>
                              </span>
                            }
                          >
                            <Badge tone={blocked ? 'danger' : 'warn'}>
                              <Icons.alert className="h-3 w-3" />
                              {blocked ? "Doesn't fit" : 'Caution'}
                            </Badge>
                          </Tooltip>
                        )}
                      </div>
                    </td>

                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cx(
                          'hidden truncate px-2 py-2 text-[13px] text-text-secondary md:table-cell',
                          c.numeric && 'tnum text-right',
                        )}
                      >
                        {c.value(part)}
                      </td>
                    ))}

                    <td className="px-2 py-2 text-right">
                      <PriceCell partId={part.id} seedPrice={part.seedPrice} />
                    </td>

                    <td className="px-1 py-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
                        <Icons.plus className="h-4 w-4" />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-sm font-medium">No matching {meta.label.toLowerCase()}</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-secondary">
                {hideIncompatible && incompatibleCount > 0
                  ? `${incompatibleCount} ${meta.label.toLowerCase()} are hidden because they don't fit this build.`
                  : 'Try removing a filter or searching for something else.'}
              </p>
              <div className="mt-3 flex justify-center gap-2">
                {activeFilterCount > 0 && (
                  <Button size="sm" onClick={() => setFilters({})}>
                    Clear filters
                  </Button>
                )}
                {hideIncompatible && incompatibleCount > 0 && (
                  <Button size="sm" onClick={() => setHideIncompatible(false)}>
                    Show incompatible
                  </Button>
                )}
              </div>
            </div>
          )}

          {sorted.length > limit && (
            <div className="p-3 text-center">
              <Button size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, sorted.length - limit)} more
              </Button>
            </div>
          )}
        </div>
      </div>

      <footer className="hidden items-center gap-3 border-t border-border px-4 py-1.5 text-[11px] text-text-muted sm:flex">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span>navigate</span>
        <Kbd>↵</Kbd>
        <span>add</span>
        <Kbd>/</Kbd>
        <span>search</span>
        <Kbd>esc</Kbd>
        <span>close</span>
      </footer>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-sans text-[10px] text-text-secondary">
      {children}
    </kbd>
  )
}

function SortHeader({
  label,
  active,
  dir,
  numeric,
  onClick,
  className,
}: {
  label: string
  active: boolean
  dir: SortDir
  numeric?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <th className={cx('px-2 py-2.5 font-medium sm:py-2', numeric && 'text-right', className)}>
      <button
        type="button"
        onClick={onClick}
        className={cx(
          'inline-flex min-h-8 items-center gap-1 transition-colors hover:text-text sm:min-h-0',
          active && 'text-text',
          numeric && 'flex-row-reverse',
        )}
      >
        {label}
        <span className={cx('text-[9px]', active ? 'opacity-100' : 'opacity-0')}>
          {dir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  )
}
