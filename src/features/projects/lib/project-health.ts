import { fromISODate } from '@/lib/working-days'

export type ProjectHealthStatus = 'on-track' | 'at-risk' | 'over-budget'

export interface ProjectHealthResult {
  status: ProjectHealthStatus
  label: string
  caption: string
}

export const PROJECT_HEALTH_VARIANT: Record<
  ProjectHealthStatus,
  'success' | 'warning' | 'destructive'
> = {
  'on-track': 'success',
  'at-risk': 'warning',
  'over-budget': 'destructive',
}

export function computeHoursBurnedPercent(
  loggedHours: number,
  budgetHours: number | null | undefined
): number | null {
  if (!budgetHours || budgetHours <= 0) return null

  return Math.round((loggedHours / budgetHours) * 100)
}

export function computeSchedulePercent(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
  today: Date = new Date()
): number | null {
  if (!dueDate) return null

  const start = startDate ? fromISODate(startDate) : null
  const end = new Date(dueDate)

  if (!start || isNaN(end.getTime()) || end <= start) return null

  const totalMs = end.getTime() - start.getTime()
  const elapsedMs = today.getTime() - start.getTime()

  return Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)))
}

const AT_RISK_BURN_AHEAD_THRESHOLD = 15
const AT_RISK_DELIVERY_BEHIND_THRESHOLD = 20

export function computeProjectHealth({
  hoursBurnedPercent,
  workDeliveredPercent,
  schedulePercent,
}: {
  hoursBurnedPercent: number | null
  workDeliveredPercent: number
  schedulePercent: number | null
}): ProjectHealthResult {
  if (hoursBurnedPercent !== null && hoursBurnedPercent > 100) {
    return {
      status: 'over-budget',
      label: 'Over budget',
      caption: `${hoursBurnedPercent}% of the planned hours for ${workDeliveredPercent}% of the work — margin is going unless scope changes.`,
    }
  }

  const burnAheadOfSchedule =
    hoursBurnedPercent !== null &&
    schedulePercent !== null &&
    hoursBurnedPercent - schedulePercent > AT_RISK_BURN_AHEAD_THRESHOLD

  const deliveryBehindSchedule =
    schedulePercent !== null &&
    schedulePercent - workDeliveredPercent > AT_RISK_DELIVERY_BEHIND_THRESHOLD

  if (burnAheadOfSchedule || deliveryBehindSchedule) {
    return {
      status: 'at-risk',
      label: 'At risk',
      caption: deliveryBehindSchedule
        ? `Delivery is behind schedule — ${workDeliveredPercent}% done with ${schedulePercent}% of the timeline gone.`
        : `Hours are burning faster than the timeline — worth a check-in before it slips.`,
    }
  }

  return {
    status: 'on-track',
    label: 'On track',
    caption:
      hoursBurnedPercent !== null && schedulePercent !== null
        ? 'Hours and delivery are moving together, and the schedule is holding.'
        : 'No estimate or due date set yet, so burn and schedule can’t be tracked precisely.',
  }
}
