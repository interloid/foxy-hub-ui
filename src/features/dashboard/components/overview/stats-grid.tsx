import { NAV_ICONS } from '@/components/layout/nav-icons'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Folder } from 'lucide-react'
import { DashboardStat, DeltaType } from '../../types'

const iconBadgeClasses: Record<
  DeltaType,
  { bg: string; text: string; border: string }
> = {
  success: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/20',
  },
  warning: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/20',
  },
  info: {
    bg: 'bg-primary/10',
    text: 'text-primary',
    border: 'border-primary/20',
  },
  destructive: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/20',
  },
}

interface StatsGridProps {
  stats: DashboardStat[]
}

export function StatsGrid({ stats }: StatsGridProps) {
  if (!stats || !Array.isArray(stats) || stats.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => {
        const iconKey = stat.icon as keyof typeof NAV_ICONS
        const IconComponent =
          (iconKey && NAV_ICONS[iconKey]) || NAV_ICONS.projects || Folder

        const iconType = stat.iconType || 'info'
        const badgeStyle = iconBadgeClasses[iconType] || iconBadgeClasses.info

        return (
          <FxCard
            key={stat.label || i}
            className="flex flex-col justify-between transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            <FxCardContent className="flex flex-col justify-between gap-4 p-4">
              {/* Header: Title and Icon Badge */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium">
                  {stat.label}
                </span>
                <div
                  className={`flex size-6.5 items-center justify-center rounded-lg border ${badgeStyle.bg} ${badgeStyle.border}`}
                >
                  <IconComponent className={`size-3.75 ${badgeStyle.text}`} />
                </div>
              </div>

              {/* Content: Value and Delta */}
              <div className="space-y-1">
                <div className="text-foreground text-[26px] font-bold tracking-tight">
                  {stat.value}
                </div>
                {stat.delta && (
                  <p className="text-muted-foreground text-[12px] font-medium">
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
