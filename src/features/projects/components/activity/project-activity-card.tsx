'use client'

import { Activity, AlertCircle } from 'lucide-react'

import { FxAvatar, FxAvatarFallback } from '@/components/shared/fx-avatar'
import { useFormatter } from '@/context/locale-provider'
import { initialsOf } from '@/lib/initials'
import { cn } from '@/lib/utils'
import { ActivityChangeChip } from '@/features/activity/components/activity-change-chip'
import { relativeTime } from '@/features/activity/lib/relative-time'

import type { ProjectActivityItem } from '../../queries/get-project-activity'

// Tints the avatar by who did it, the reason `activity_events.actor_kind` exists.
const ACTOR_AVATAR_CLASS: Record<
  Exclude<ProjectActivityItem['actorKind'], 'system'>,
  string
> = {
  member: 'bg-primary',
  client: 'bg-info',
}

interface ProjectActivityCardProps {
  activities: ProjectActivityItem[]
  isError?: boolean
}

export function ProjectActivityCard({
  activities,
  isError = false,
}: ProjectActivityCardProps) {
  const fmt = useFormatter()

  return (
    <section
      aria-labelledby="project-activity-heading"
      className="bg-card border-border overflow-hidden rounded-xl border shadow-xs"
    >
      <header className="border-border/60 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b px-5 py-4">
        <h3
          id="project-activity-heading"
          className="text-foreground text-[14px] font-semibold"
        >
          Activity on this project
        </h3>
        <p className="text-muted-foreground text-xs">
          Append-only - corrections are new entries
        </p>
      </header>

      {isError ? (
        <div className="text-destructive flex items-center gap-2 px-5 py-4 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load activity.</span>
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
          <div className="bg-muted text-muted-foreground mb-2.5 flex h-10 w-10 items-center justify-center rounded-full">
            <Activity className="size-5" />
          </div>
          <p className="text-foreground text-[13.5px] font-medium">
            No activity yet
          </p>
          <p className="text-muted-foreground mt-0.5 text-[12px]">
            Approvals, uploads, updates and invoices on this project will appear
            here.
          </p>
        </div>
      ) : (
        <ul className="divide-border/60 divide-y">
          {activities.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-5 py-4">
              {item.actorKind === 'system' ? (
                // Nobody did it - Stripe, a scheduled job - so there are no initials to show.
                <span
                  aria-hidden="true"
                  className="bg-muted flex size-7.5 shrink-0 items-center justify-center rounded-full"
                >
                  <span className="bg-muted-foreground/40 size-2 rounded-full" />
                </span>
              ) : (
                <FxAvatar className="shrink-0">
                  <FxAvatarFallback
                    className={cn(
                      'text-[11px]',
                      ACTOR_AVATAR_CLASS[item.actorKind]
                    )}
                  >
                    {initialsOf(item.summary, null)}
                  </FxAvatarFallback>
                </FxAvatar>
              )}

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <p className="text-foreground text-[13px] leading-snug">
                    {item.summary}
                  </p>
                  <time
                    dateTime={item.createdAt}
                    title={fmt.date(item.createdAt, 'dateTime')}
                    // Relative to "now", which differs between the server render and the browser.
                    suppressHydrationWarning
                    className="text-subtle-foreground shrink-0 text-[11.5px] whitespace-nowrap"
                  >
                    {relativeTime(item.createdAt, fmt)}
                  </time>
                </div>

                {item.changes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.changes.map((change, i) => (
                      <ActivityChangeChip key={i} change={change} />
                    ))}
                  </div>
                )}

                {item.note && (
                  <p className="text-muted-foreground text-[12.5px] break-words">
                    &ldquo;{item.note}&rdquo;
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
