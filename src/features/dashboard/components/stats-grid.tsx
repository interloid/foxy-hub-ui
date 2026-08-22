import { NAV_ICONS } from '@/components/layout/nav-icons'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Folder } from 'lucide-react'
import { DashboardStat } from '../types'

interface StatsGridProps {
  stats: DashboardStat[]
}

type DeltaType = 'success' | 'warning' | 'info' | 'destructive'

// CSS variable mappings derived from globals.css
const iconBadgeClasses: Record<DeltaType, { bg: string; text: string }> = {
  success: {
    bg: 'bg-success/10',
    text: 'text-success',
  },
  warning: {
    bg: 'bg-warning/10',
    text: 'text-warning',
  },
  info: {
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
  destructive: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
  },
}

const deltaTextClasses: Record<DeltaType, string> = {
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-muted-foreground',
  destructive: 'text-destructive',
}

export function StatsGrid({ stats }: StatsGridProps) {
  if (!stats || !Array.isArray(stats)) {
    return null
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => {
        const iconKey = stat.icon as keyof typeof NAV_ICONS
        const IconComponent =
          (iconKey && NAV_ICONS[iconKey]) || NAV_ICONS.projects || Folder

        const deltaType = (stat.deltaType as DeltaType) || 'info'
        const iconType = (stat.iconType as DeltaType) || 'info'

        const badgeStyle = iconBadgeClasses[iconType] || iconBadgeClasses.info
        const textColor = deltaTextClasses[deltaType] || deltaTextClasses.info

        return (
          <FxCard
            key={stat.label || i}
            className="flex flex-col justify-between transition-transform duration-200 ease-out hover:-translate-y-1"
          >
            <FxCardContent className="flex flex-col justify-between gap-4 p-4">
              {/* Header: Title and Icon Badge */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium">
                  {stat.label}
                </span>
                <div
                  className={`flex h-6.5 w-6.5 items-center justify-center rounded-lg border ${badgeStyle.bg}`}
                >
                  <IconComponent
                    className={`${badgeStyle.text}`}
                    width={15}
                    height={15}
                  />
                </div>
              </div>

              {/* Content: Value and Delta */}
              <div className="space-y-1">
                <div className="text-foreground text-[26px] font-bold tracking-tight">
                  {stat.value}
                </div>
                {stat.delta && (
                  <p className={`text-[12px] font-medium ${textColor}`}>
                    {stat.delta}
                  </p>
                )}
              </div>
            </FxCardContent>
          </FxCard>
        )
      })}
    </div>
  )
}
