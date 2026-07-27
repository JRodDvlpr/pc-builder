'use client'

import { useMemo } from 'react'

import type { PowerEstimate } from '@/lib/compat/types'
import { Icons } from '@/components/ui/icons'
import { Tooltip, cx } from '@/components/ui/primitives'

/**
 * Angles run clockwise from 12 o'clock. The sweep starts low on the left, goes
 * up over the top and back down to the right — the orientation people already
 * read as a gauge.
 */
const START_ANGLE = 220
const SWEEP = 280
const RADIUS = 62
const CENTER = 80
const WIDTH = 160
const HEIGHT = 142

function polar(angleDeg: number, r = RADIUS) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) }
}

function arcPath(fromDeg: number, toDeg: number) {
  const start = polar(fromDeg)
  const end = polar(toDeg)
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x} ${end.y}`
}

/**
 * Estimated draw against PSU capacity.
 *
 * The gauge is scaled to the PSU when one is selected, so "how close am I to the
 * limit" is answerable at a glance — the thing PCPartPicker only tells you in a
 * sentence at the bottom of the page. With no PSU chosen it scales to the
 * recommended size instead and reads as advice rather than a warning.
 */
export function WattageMeter({
  power,
  psuWattage,
  psuLabel,
}: {
  power: PowerEstimate
  psuWattage?: number
  psuLabel?: string
}) {
  const scale = psuWattage ?? Math.max(power.recommendedPsuW, 100)
  const pct = Math.min(power.totalWatts / scale, 1)

  const tone = useMemo(() => {
    if (!psuWattage) return 'accent'
    if (power.totalWatts > psuWattage) return 'danger'
    if (pct > 0.8) return 'warn'
    return 'ok'
  }, [psuWattage, power.totalWatts, pct])

  const strokeVar = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', accent: 'var(--accent)' }[tone]
  const valueEnd = START_ANGLE + SWEEP * pct

  // The 80% mark is where transient spikes start tripping OCP.
  const safeMark = START_ANGLE + SWEEP * 0.8
  const safeTick = { inner: polar(safeMark, RADIUS - 9), outer: polar(safeMark, RADIUS + 9) }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <path
            d={arcPath(START_ANGLE, START_ANGLE + SWEEP)}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={13}
            strokeLinecap="round"
          />
          {pct > 0.005 && (
            <path
              d={arcPath(START_ANGLE, valueEnd)}
              fill="none"
              stroke={strokeVar}
              strokeWidth={13}
              strokeLinecap="round"
              style={{ transition: 'd 400ms cubic-bezier(0.22,1,0.36,1)' }}
            />
          )}
          {psuWattage && (
            <line
              x1={safeTick.inner.x}
              y1={safeTick.inner.y}
              x2={safeTick.outer.x}
              y2={safeTick.outer.y}
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )}
        </svg>

        {/* Centred on the arc's own centre, not the SVG box, so the number sits
            in the ring rather than drifting toward the open bottom. */}
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ top: CENTER - 26 }}
        >
          <div className="flex items-baseline gap-0.5">
            <span
              data-testid="power-watts"
              className="tnum text-3xl leading-none font-semibold tracking-tight"
            >
              {power.totalWatts}
            </span>
            <span className="text-sm text-text-muted">W</span>
          </div>
          <span className="mt-1 text-[10px] tracking-wide text-text-muted uppercase">
            estimated draw
          </span>
        </div>
      </div>

      <div className="mt-1 w-full text-center">
        {psuWattage ? (
          <p className="text-[13px] text-text-secondary">
            <span className={cx('font-medium', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>
              {power.loadPct}% load
            </span>{' '}
            of {psuWattage} W
            {psuLabel && <span className="block truncate text-xs text-text-muted">{psuLabel}</span>}
          </p>
        ) : (
          <p className="text-[13px] text-text-secondary">
            Recommended supply:{' '}
            <span className="font-medium text-text">{power.recommendedPsuW} W</span>
          </p>
        )}
      </div>

      {power.breakdown.length > 0 && (
        <Tooltip
          side="bottom"
          label={
            <span className="block space-y-1">
              {power.breakdown.map((line) => (
                <span key={line.label} className="flex justify-between gap-4">
                  <span className="text-text-secondary">{line.label}</span>
                  <span className="tnum">{line.watts} W</span>
                </span>
              ))}
              <span className="mt-1 flex justify-between gap-4 border-t border-border pt-1 font-medium">
                <span>Total</span>
                <span className="tnum">{power.totalWatts} W</span>
              </span>
              <span className="block pt-1 text-[11px] text-text-muted">
                Monitors draw from the wall, not the PSU, so they are excluded.
              </span>
            </span>
          }
        >
          <button
            type="button"
            className="mt-2 inline-flex min-h-9 items-center gap-1 px-2 text-[11px] text-text-muted transition-colors hover:text-text-secondary sm:min-h-0 sm:px-0"
          >
            <Icons.bolt className="h-3 w-3" />
            {power.breakdown.length} component{power.breakdown.length === 1 ? '' : 's'} · see breakdown
          </button>
        </Tooltip>
      )}
    </div>
  )
}
