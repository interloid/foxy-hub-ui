'use client'

import { FxAvatar, FxAvatarFallback } from '@/components/shared/fx-avatar'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { ActivityEvent } from '../types'

interface RecentActivityProps {
  activities?: ActivityEvent[]
}

export function RecentActivity({ activities }: RecentActivityProps) {
  if (!activities || activities.length === 0) {
    return null
  }

  return (
    <FxCard className="overflow-hidden">
      <FxCardContent className="p-0">
        {/* Header */}
        <div className="border-border border-b px-5 py-4">
          <h3 className="text-foreground text-[14px] font-semibold">
            Recent activity
          </h3>
        </div>

        {/* Activity List */}
        <div className="divide-border/40 divide-y p-2 sm:p-3">
          {activities.map((item) => {
            const initials = item.initials || 'AC'

            return (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg p-2.5 transition-colors sm:p-3"
              >
                {/* Avatar with dynamic server colors */}
                <FxAvatar className="size-7 shrink-0">
                  <FxAvatarFallback
                    style={{
                      backgroundColor: item.avatarBg,
                      color: item.avatarColor,
                    }}
                    className="text-[11px] font-semibold"
                  >
                    {initials}
                  </FxAvatarFallback>
                </FxAvatar>

                {/* Event Summary & Relative Time */}
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
      </FxCardContent>
    </FxCard>
  )
}
