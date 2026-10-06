import { initialsOf } from '@/lib/initials'
import { AlertCircle } from 'lucide-react'
import Image from 'next/image'
import type { ProjectAllocationItem } from '../../types'

interface PlannedVsLoggedCardProps {
  allocations?: ProjectAllocationItem[] | null
  weeklyLoggedMinutesByUser?: Record<string, number>
  isError?: boolean
}

function formatHours(minutes: number): string {
  const hours = minutes / 60
  return Number.isInteger(hours) ? hours.toString() : hours.toFixed(1)
}

export function PlannedVsLoggedCard({
  allocations = [],
  weeklyLoggedMinutesByUser = {},
  isError = false,
}: PlannedVsLoggedCardProps) {
  const safeAllocations = allocations ?? []

  return (
    <section
      aria-labelledby="planned-vs-logged-heading"
      className="bg-card border-border rounded-xl border shadow-xs"
    >
      <div className="border-border/60 border-b px-5 py-4">
        <h3
          id="planned-vs-logged-heading"
          className="text-foreground text-[14px] font-semibold"
        >
          Planned against logged, per person
        </h3>
      </div>

      <div className="divide-border/60 divide-y">
        {isError ? (
          <div className="text-destructive flex items-center gap-2 px-5 py-4 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to load allocations.</span>
          </div>
        ) : safeAllocations.length > 0 ? (
          safeAllocations.map((alloc) => {
            const loggedMinutes = weeklyLoggedMinutesByUser[alloc.userId] ?? 0

            return (
              <div
                key={alloc.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  {alloc.userAvatarUrl ? (
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                      <Image
                        src={alloc.userAvatarUrl}
                        alt={alloc.userName}
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold select-none">
                      {initialsOf(alloc.userName, null)}
                    </div>
                  )}
                  <p className="text-foreground text-[13px] font-semibold">
                    {alloc.userName}
                  </p>
                </div>

                <span className="text-muted-foreground font-mono text-xs">
                  planned {alloc.hoursPerDay}h/day · {alloc.daysPerWeek} days/wk
                  · {formatHours(loggedMinutes)}h logged this week
                </span>
              </div>
            )
          })
        ) : (
          <p className="text-muted-foreground px-5 py-6 text-xs italic">
            No team members allocated.
          </p>
        )}
      </div>
    </section>
  )
}
