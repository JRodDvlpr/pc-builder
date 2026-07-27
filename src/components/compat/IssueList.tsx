'use client'

import { getPart } from '@/lib/catalog'
import { CATEGORY_META } from '@/lib/catalog/types'
import type { CompatReport, Issue, Severity } from '@/lib/compat/types'
import { useBuild } from '@/lib/build/store'
import { Icons } from '@/components/ui/icons'
import { cx } from '@/components/ui/primitives'

const SEVERITY_STYLE: Record<Severity, { icon: typeof Icons.alert; ring: string; text: string; bg: string; label: string }> = {
  error: { icon: Icons.alert, ring: 'border-danger/30', text: 'text-danger', bg: 'bg-danger-soft', label: 'Blocker' },
  warning: { icon: Icons.alert, ring: 'border-warn/30', text: 'text-warn', bg: 'bg-warn-soft', label: 'Warning' },
  info: { icon: Icons.info, ring: 'border-border', text: 'text-text-muted', bg: 'bg-surface-2', label: 'Note' },
}

function IssueCard({ issue }: { issue: Issue }) {
  const style = SEVERITY_STYLE[issue.severity]
  const StyleIcon = style.icon
  const openPickerFor = useBuild((s) => s.openPickerFor)

  return (
    <li className={cx('rounded-xl border p-3', style.ring, style.bg)}>
      <div className="flex gap-2.5">
        <StyleIcon className={cx('mt-0.5 h-4 w-4 shrink-0', style.text)} />
        <div className="min-w-0 flex-1">
          <p className={cx('text-[13px] leading-snug font-semibold', style.text)}>{issue.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{issue.detail}</p>

          {issue.partIds.length > 0 && (
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              {[...new Set(issue.partIds)].map((partId) => {
                const part = getPart(partId)
                if (!part) return null
                return (
                  <button
                    key={partId}
                    type="button"
                    onClick={() => openPickerFor(part.category, partId)}
                    className="inline-flex min-h-9 max-w-full min-w-0 items-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text sm:min-h-0 sm:px-1.5 sm:py-1"
                    title={`Swap ${part.model}`}
                  >
                    <Icons.swap className="h-3 w-3 shrink-0" />
                    <span className="truncate">Swap {part.model}</span>
                  </button>
                )
              })}
            </div>
          )}

          {issue.partIds.length === 0 && issue.categories.length > 0 && (
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              {issue.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => openPickerFor(c)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text sm:min-h-0 sm:px-1.5 sm:py-1"
                >
                  <Icons.plus className="h-3 w-3" />
                  {CATEGORY_META[c].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function IssueList({ report }: { report: CompatReport }) {
  const { errors, warnings, infos } = report
  const total = errors.length + warnings.length

  return (
    <section aria-label="Compatibility">
      <header className="mb-2.5 flex items-center gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-text-muted uppercase">
          Compatibility
        </h2>
        {total === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 py-0.5 text-[11px] font-medium text-ok">
            <Icons.check className="h-3 w-3" />
            All clear
          </span>
        ) : (
          <span className="flex items-center gap-1">
            {errors.length > 0 && (
              <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">
                {errors.length} blocker{errors.length === 1 ? '' : 's'}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
                {warnings.length} warning{warnings.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
      </header>

      {total === 0 && infos.length === 0 ? (
        <div className="rounded-xl border border-ok/25 bg-ok-soft p-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ok">
            <Icons.check className="h-4 w-4" />
            No compatibility problems found
          </p>
          <p className="mt-1 pl-6 text-[13px] text-text-secondary">
            Every part in this build fits, connects, and has the power it needs.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {[...errors, ...warnings, ...infos].map((issue, i) => (
            <IssueCard key={`${issue.ruleId}-${i}`} issue={issue} />
          ))}
        </ul>
      )}
    </section>
  )
}
