'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxProgress } from '@/components/shared/fx-progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Info } from 'lucide-react'
import { CapacityViewProps } from '../types'

function getInitials(name: string): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getStatusConfig(percentage: number) {
  if (percentage > 100) {
    return {
      label: 'Over-committed',
      variant: 'destructive' as const,
      textColor: 'text-destructive',
    }
  }
  if (percentage === 100) {
    return {
      label: 'Fully committed',
      variant: 'success' as const,
      textColor: 'text-success',
    }
  }
  return {
    label: 'Has capacity',
    variant: 'warning' as const,
    textColor: 'text-primary',
  }
}

export function CapacityView({
  capacities,
  standardHoursPerDay = 8,
  className,
}: CapacityViewProps) {
  return (
    <div
      className={cn(
        'bg-card border-border/70 overflow-hidden rounded-xl border shadow-xs',
        className
      )}
    >
      {/* Header */}
      <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b px-6 py-4">
        <h3 className="text-foreground text-base text-[14px] font-semibold">
          Team capacity committed hours per day
        </h3>
        <span className="text-subtle-foreground text-xs">
          Standard day {standardHoursPerDay}h · summed across all active
          allocations
        </span>
      </div>

      {/* Capacity List */}
      <div className="divide-border/50 divide-y">
        {capacities.map((user) => {
          const totalHours = user.allocations.reduce(
            (acc, curr) => acc + (Number(curr.hoursPerDay) || 0),
            0
          )

          // Calculate percentage against org's daily capacity
          const percentage = Math.round(
            (totalHours / standardHoursPerDay) * 100
          )
          const status = getStatusConfig(percentage)

          return (
            <div key={user.userId} className="space-y-3 p-6">
              {/* User Header Info */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {user.avatarUrl && (
                      <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                    )}
                    <AvatarFallback className="bg-primary text-brand-white text-[11px] font-semibold">
                      {getInitials(user.fullName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex flex-col">
                    <span className="text-foreground text-base text-[13.5px] font-bold">
                      {user.fullName}
                    </span>
                    <span className="text-muted-foreground text-xs capitalize">
                      {user.role}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={cn(
                      'text-base text-[15px] font-bold',
                      status.textColor
                    )}
                  >
                    {percentage}%
                  </div>
                  <div className="text-subtle-foreground text-xs font-medium">
                    {totalHours} h/day
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <FxProgress
                value={Math.min(percentage, 100)}
                variant={status.variant}
                size="lg"
                className="bg-muted"
              />

              {/* Status and Allocation Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className={cn('text-xs font-semibold', status.textColor)}>
                  {status.label}
                </span>

                {user.allocations.map((alloc) => (
                  <FxBadge
                    key={alloc.id}
                    variant="secondary"
                    shape="pill"
                    className="bg-muted/80 text-foreground hover:bg-muted text-xs font-normal"
                  >
                    {alloc.projectName} · {alloc.hoursPerDay}h
                  </FxBadge>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer Note */}
      <div className="bg-muted/30 border-border/50 text-muted-foreground flex items-center gap-2.5 border-t px-6 py-4 text-xs">
        <Info className="size-4 shrink-0" />
        <span>
          Capacity is measured per person across every project a part-timer on
          two projects can still be over-committed.
        </span>
      </div>
    </div>
  )
}
