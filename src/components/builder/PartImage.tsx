'use client'

import { useState } from 'react'

import { useBuild } from '@/lib/build/store'
import { CATEGORY_META, type Category } from '@/lib/catalog/types'
import { Icon } from '@/components/ui/icons'
import { cx } from '@/components/ui/primitives'

/**
 * Product thumbnail, falling back to the category icon.
 *
 * Images come from the retailer CDN alongside the price, so a part only has one
 * once it has been scraped — a cold cache shows the icon instead. That makes the
 * fallback the common case on first load, not an edge case, so it is styled to
 * look deliberate rather than broken.
 *
 * Rendered as a plain `<img>` rather than `next/image`: the sources are already
 * small (8–30 KB) and CDN-optimised, so routing them through the Next image
 * optimiser would add server work and a `remotePatterns` allowlist for no gain.
 * `loading="lazy"` keeps a 60-row picker from fetching everything at once.
 */
export function PartImage({
  partId,
  category,
  className,
  iconClassName,
}: {
  partId: string
  category: Category
  className?: string
  iconClassName?: string
}) {
  const image = useBuild((s) => s.prices[partId]?.image)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <span
      className={cx(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2',
        className,
      )}
    >
      {/*
        The icon is always rendered underneath and the image is layered over it,
        rather than swapped in on load. `onError` only fires for a request that
        actually fails — one that merely hangs (flaky network, a blocked CDN)
        would otherwise leave an empty box on screen indefinitely. This way the
        worst case degrades to the icon instead of to nothing.
      */}
      <Icon
        name={CATEGORY_META[category].icon as never}
        className={cx('text-text-muted', iconClassName ?? 'h-4 w-4')}
      />
      {image && !failed && (
        // These are already small, CDN-optimised remote thumbnails, so routing
        // them through the Next image optimiser would add server cost and a
        // remotePatterns allowlist for no benefit. See the note above.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          // Decorative: the part name sits right next to it, so announcing the
          // image would just repeat it.
          aria-hidden="true"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          // Stays transparent until it has actually decoded, so the icon shows
          // through meanwhile; the opaque background then hides the icon rather
          // than letting it composite through a transparent product PNG.
          className={cx(
            'absolute inset-0 h-full w-full bg-surface-2 object-contain transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </span>
  )
}
