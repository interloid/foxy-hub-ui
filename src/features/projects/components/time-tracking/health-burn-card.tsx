import { FxBadge } from '@/components/shared/fx-badge'
import { getFormatter } from '@/lib/dal'
import { FxProgress } from '@/components/shared/fx-progress'
import { AlertCircle } from 'lucide-react'
import {
  computeHoursBurnedPercent,
  computeProjectHealth,
  computeSchedulePercent,
  PROJECT_HEALTH_VARIANT,
} from '../../lib/project-health'

interface HealthBurnCardProps {
  loggedHours: number
  budgetHours: number | null
  workDeliveredPercent: number
  startDate?: string | null
  dueDate?: string | null
  isError?: boolean
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1)
}

function BarStat({
  label,
  detail,
  percent,
  variant,
}: {
  label: string
  detail: string
  percent: number
  variant: 'success' | 'warning' | 'destructive' | 'default' | 'info'
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        <span className="text-muted-foreground truncate text-xs">{detail}</span>
      </div>
      <FxProgress
        value={percent}
        size="lg"
        variant={variant}
        className="mt-2"
      />
    </div>
  )
}

export async function HealthBurnCard({
  loggedHours,
  budgetHours,
  workDeliveredPercent,
  startDate,
  dueDate,
  isError = false,
}: HealthBurnCardProps) {
  if (isError) {
    return (
      <section className="bg-card border-border rounded-xl border p-5 shadow-xs">
        <div className="text-destructive flex items-center gap-2 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load project health.</span>
        </div>
      </section>
    )
  }

  const hoursBurnedPercent = computeHoursBurnedPercent(loggedHours, budgetHours)

  const schedulePercent = computeSchedulePercent(startDate, dueDate)

  const health = computeProjectHealth({
    hoursBurnedPercent,
    workDeliveredPercent,
    schedulePercent,
  })

  const fmt = await getFormatter()
  const formattedDueDate = dueDate ? fmt.date(dueDate, 'day') || null : null

  return (
    <section
      aria-labelledby="health-burn-card-heading"
      className="bg-card border-border rounded-xl border p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3
            id="health-burn-card-heading"
            className="text-foreground text-[14px] font-semibold"
          >
            Health - burn against delivery
          </h3>
          <FxBadge variant={PROJECT_HEALTH_VARIANT[health.status]} dot>
            {health.label}
          </FxBadge>
        </div>
        {formattedDueDate && (
          <span className="text-muted-foreground text-xs">
            Due {formattedDueDate}
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <BarStat
          label="Hours burned"
          detail={
            budgetHours && budgetHours > 0
              ? `${formatHours(loggedHours)}h of ${formatHours(budgetHours)}h · ${hoursBurnedPercent}%`
              : 'No hours estimate set'
          }
          percent={hoursBurnedPercent ?? 0}
          variant={PROJECT_HEALTH_VARIANT[health.status]}
        />
        <BarStat
          label="Work delivered"
          detail={`${workDeliveredPercent}% delivered`}
          percent={workDeliveredPercent}
          variant="default"
        />
        <BarStat
          label="Schedule"
          detail={
            schedulePercent !== null
              ? `${schedulePercent}% of the schedule gone`
              : 'No due date set'
          }
          percent={schedulePercent ?? 0}
          variant="info"
        />
      </div>

      <p className="text-muted-foreground mt-4 text-xs">{health.caption}</p>
    </section>
  )
}
