import { FxAvatar, FxAvatarFallback } from '@/components/shared/fx-avatar'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Activity } from 'lucide-react'
import { ActivityEvent } from '../../types'
import { getAvatarPaletteClass } from './team-capacity'

interface RecentActivityProps {
  activities?: ActivityEvent[]
}

export function RecentActivity({ activities = [] }: RecentActivityProps) {
  const hasActivities = activities && activities.length > 0

  return (
    <FxCard className="overflow-hidden">
      <FxCardContent className="p-0">
        {/* Header */}
        <div className="border-border border-b px-5 py-4">
          <h3 className="text-foreground text-[14px] font-semibold">
            Recent activity
          </h3>
        </div>

        {/* Activity List OR Empty State */}
        {hasActivities ? (
          <div className="divide-border/40 divide-y p-2 sm:p-3">
            {activities.map((item, index) => {
              const initials = item.initials || 'AC'

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg p-2.5 transition-colors sm:p-3"
                >
                  <FxAvatar className="size-7 shrink-0">
                    <FxAvatarFallback
                      className={`text-[11px] font-semibold ${getAvatarPaletteClass(index)}`}
                    >
                      {initials}
                    </FxAvatarFallback>
                  </FxAvatar>

                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-[13px] leading-snug font-normal">
                      {item.text}
                    </p>
                    <span className="text-subtle-foreground mt-0.5 block text-[11.5px]">
                      {item.time}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
            <div className="bg-muted text-muted-foreground mb-2.5 flex h-10 w-10 items-center justify-center rounded-full">
              <Activity className="size-5" />
            </div>
            <p className="text-foreground text-[13.5px] font-medium">
              No recent activity
            </p>
            <p className="text-muted-foreground mt-0.5 text-[12px]">
              Actions and updates across your workspace will appear here.
            </p>
          </div>
        )}
      </FxCardContent>
    </FxCard>
  )
}
