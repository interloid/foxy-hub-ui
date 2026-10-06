'use client'

import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { formatMinutesToLabel } from '@/lib/time'
import { cn } from '@/lib/utils'
import type {
  LogTimeProject,
  LogTimeRecentEntry,
  LogTimeWeekDay,
} from './types'

/** 90 -> "1.5h", 120 -> "2h", 0 -> "-". */
function shortHours(minutes: number): string {
  if (minutes <= 0) return '-'
  const hours = Math.round((minutes / 60) * 10) / 10
  return `${hours}h`
}

export function ThisWeekCard({
  week,
  totalMinutes,
}: {
  week: LogTimeWeekDay[]
  totalMinutes: number
}) {
  const emptyDays = week.filter((d) => !d.isFuture && d.minutes === 0).length

  return (
    <FxCard className="rounded-xl">
      <FxCardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-foreground text-[14px] font-semibold">
            This week
          </h2>
          <span className="text-muted-foreground text-xs">
            {formatMinutesToLabel(totalMinutes)} logged
          </span>
        </div>

        <ol className="grid gap-1.5 sm:grid-cols-5">
          {week.map((day) => (
            <li
              key={day.date}
              aria-current={day.isToday ? 'date' : undefined}
              className={cn(
                'border-border bg-muted/60 flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5',
                day.isToday && 'border-primary bg-primary/10'
              )}
            >
              <span className="text-muted-foreground text-[11px] font-semibold uppercase">
                {day.label}
              </span>
              <span
                className={cn(
                  'font-mono text-[13px] font-semibold',
                  day.minutes > 0 ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {shortHours(day.minutes)}
              </span>
            </li>
          ))}
        </ol>

        <p className="text-muted-foreground text-xs">
          {emptyDays > 0
            ? `${emptyDays} ${emptyDays === 1 ? 'day' : 'days'} with nothing logged - memory loses 5-15% of billable time`
            : 'Every day so far has time logged.'}
        </p>
      </FxCardContent>
    </FxCard>
  )
}

export function ProjectProgressCard({
  project,
  seesAllHours,
}: {
  project: LogTimeProject | undefined
  seesAllHours: boolean
}) {
  if (!project) return null

  const loggedHours = Math.round((project.approvedMinutes / 60) * 10) / 10
  const percent =
    project.plannedHours && project.plannedHours > 0
      ? Math.min(100, (loggedHours / project.plannedHours) * 100)
      : null
  // Contributors can only read their own entries, so say whose hours these are.
  const who = seesAllHours ? '' : 'You have '

  return (
    <FxCard className="rounded-xl">
      <FxCardContent className="space-y-2.5 p-4">
        <div>
          <h2 className="text-foreground text-[14px] font-semibold">
            {project.name}
          </h2>
          <p className="text-muted-foreground text-xs">
            {who}
            {loggedHours}h logged
            {project.plannedHours !== null &&
              ` of ${project.plannedHours}h planned`}
          </p>
        </div>

        {percent !== null && (
          <div
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${project.name} hours used`}
            className="bg-muted h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        <p className="text-muted-foreground text-xs leading-relaxed">
          Billable hours land here the moment they are approved, so retainer
          overages surface before the invoice does.
        </p>
      </FxCardContent>
    </FxCard>
  )
}

export function LogAgainCard({
  entries,
  onPick,
}: {
  entries: LogTimeRecentEntry[]
  onPick: (entry: LogTimeRecentEntry) => void
}) {
  return (
    <FxCard className="rounded-xl">
      <FxCardContent className="space-y-3 p-4">
        <div>
          <h2 className="text-foreground text-[14px] font-semibold">
            Log it again
          </h2>
          <p className="text-muted-foreground text-xs">
            Your recent work - one tap fills project, milestone and description.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nothing logged yet - your recent work will show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={`${entry.projectId}|${entry.milestoneId ?? ''}|${entry.description}`}
              >
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  className="border-border bg-muted/60 hover:bg-muted w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors"
                >
                  <span className="text-foreground block text-[13px] font-semibold">
                    {entry.projectName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {entry.milestoneTitle ?? 'General'} · {entry.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </FxCardContent>
    </FxCard>
  )
}
