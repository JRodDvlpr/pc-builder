'use client'

import { useBuild } from '@/lib/build/store'
import { formatRelative, formatUsd } from '@/lib/build/total'
import { PROVIDER_LABELS, type PriceSource } from '@/lib/scrape/types'
import { Icons } from '@/components/ui/icons'
import { Skeleton, Tooltip, cx } from '@/components/ui/primitives'

const SOURCE_STYLE: Record<PriceSource, { dot: string; label: string }> = {
  live: { dot: 'bg-ok', label: 'Live price' },
  cached: { dot: 'bg-warn', label: 'Cached price' },
  seed: { dot: 'bg-text-muted', label: 'Reference price' },
}

/**
 * A price with its provenance.
 *
 * Prices stream in per row rather than blocking the table, so a cell shows a
 * shimmer while its request is in flight and then resolves in place. The dot
 * says where the number came from — knowing a price is three days stale is more
 * useful than being shown a confident number with no history.
 */
export function PriceCell({
  partId,
  seedPrice,
  className,
}: {
  partId: string
  seedPrice: number
  className?: string
}) {
  const info = useBuild((s) => s.prices[partId])
  const loading = useBuild((s) => s.pricesLoading.has(partId))

  if (!info && loading) {
    return <Skeleton className={cx('h-4 w-14 align-middle', className)} />
  }

  const price = info?.price ?? seedPrice
  const source: PriceSource = info?.source ?? 'seed'
  const style = SOURCE_STYLE[source]
  const best = info?.offers?.[0]

  return (
    <Tooltip
      side="top"
      label={
        <span className="block">
          <span className="block font-medium">{style.label}</span>
          {info?.offers && info.offers.length > 0 ? (
            <>
              {info.offers.slice(0, 3).map((o) => (
                <span key={`${o.provider}-${o.url}`} className="mt-0.5 flex justify-between gap-4">
                  <span className="text-text-secondary">{PROVIDER_LABELS[o.provider]}</span>
                  <span className="tnum">
                    {formatUsd(o.price)}
                    {!o.inStock && <span className="ml-1 text-text-muted">out of stock</span>}
                  </span>
                </span>
              ))}
              {info.fetchedAt && (
                <span className="mt-1 block text-[11px] text-text-muted">
                  Checked {formatRelative(info.fetchedAt)}
                </span>
              )}
            </>
          ) : (
            <span className="mt-0.5 block text-text-secondary">
              No live listing matched this part, so the catalog reference price is shown.
            </span>
          )}
        </span>
      }
    >
      <span className={cx('inline-flex items-center gap-1.5', className)}>
        <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} aria-hidden="true" />
        <span className="tnum text-[13px] font-medium">{formatUsd(price)}</span>
        {best && (
          <a
            href={best.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            className="-m-2 inline-flex h-8 w-8 items-center justify-center text-text-muted transition-colors hover:text-accent sm:m-0 sm:h-auto sm:w-auto"
            aria-label={`Open on ${PROVIDER_LABELS[best.provider]}`}
          >
            <Icons.external className="h-3 w-3" />
          </a>
        )}
      </span>
    </Tooltip>
  )
}
