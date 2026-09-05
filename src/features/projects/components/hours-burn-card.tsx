import { FxProgress } from '@/components/shared/fx-progress'
import type { ProjectAllocationItem } from '../types'

interface HoursBurnCardProps {
  allocations?: ProjectAllocationItem[] | null
  projectEndDate?: string | Date | null
  /** Actual hours logged in the current month (defaults to 0 if not yet fetched) */
  loggedHours?: number
}

/**
 * Calculates working days (Monday-Friday if daysPerWeek === 5) within a date range
 */
function getWorkingDaysInRange(
  startDate: Date,
  endDate: Date,
  daysPerWeek: number = 5
): number {
  if (startDate > endDate) return 0

  let workingDays = 0
  const cur = new Date(startDate)

  while (cur <= endDate) {
    const day = cur.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
    if (daysPerWeek >= 6) {
      // Mon-Sat
      if (day >= 1 && day <= 6) workingDays++
    } else {
      // Standard Mon-Fri
      if (day >= 1 && day <= 5) workingDays++
    }
    cur.setDate(cur.getDate() + 1)
  }

  return workingDays
}

/**
 * Calculates total allocated monthly capacity based on active allocations
 */
function calculateMonthlyAllocatedHours(
  allocations: ProjectAllocationItem[],
  projectEndDate?: string | Date | null
): number {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0) // Last day of current month

  const defaultEndDate = projectEndDate ? new Date(projectEndDate) : monthEnd

  return allocations.reduce((total, alloc) => {
    const allocStart = new Date(alloc.effectiveFrom)
    const allocEnd = alloc.effectiveTo
      ? new Date(alloc.effectiveTo)
      : defaultEndDate

    // Find overlapping date range with the current calendar month
    const effectiveStart = allocStart > monthStart ? allocStart : monthStart
    const effectiveEnd = allocEnd < monthEnd ? allocEnd : monthEnd

    if (effectiveStart > effectiveEnd) return total

    const workingDays = getWorkingDaysInRange(
      effectiveStart,
      effectiveEnd,
      alloc.daysPerWeek
    )

    return total + workingDays * (alloc.hoursPerDay || 0)
  }, 0)
}

export function HoursBurnCard({
  allocations = [],
  projectEndDate,
  loggedHours = 0,
}: HoursBurnCardProps) {
  const safeAllocations = allocations ?? []

  // Total target allocated capacity for the current month
  const totalAllocatedHours = calculateMonthlyAllocatedHours(
    safeAllocations,
    projectEndDate
  )

  const percentage =
    totalAllocatedHours > 0
      ? Math.min(100, Math.round((loggedHours / totalAllocatedHours) * 100))
      : 0

  const remainingHours = Math.max(0, totalAllocatedHours - loggedHours)

  // Format helper to strip unnecessary trailing zeros (e.g. 6.5h vs 6h)
  const formatHours = (val: number) =>
    Number.isInteger(val) ? val.toString() : val.toFixed(1)

  return (
    <section
      aria-labelledby="hours-burn-card-heading"
      className="bg-card border-border rounded-xl border p-5 text-[14px] shadow-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3
          id="hours-burn-card-heading"
          className="text-foreground font-semibold"
        >
          Hours burn
        </h3>
        <span className="text-primary font-bold">{percentage}%</span>
      </div>

      {/* Main Metric Display */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-foreground text-3xl font-extrabold tracking-tight">
          {formatHours(loggedHours)}h
        </span>
        <span className="text-subtle-foreground text-sm font-normal">
          of {formatHours(totalAllocatedHours)}h
        </span>
      </div>

      {/* Progress Bar Track */}
      <FxProgress
        value={percentage}
        variant="default"
        size="lg"
        className="mt-3.5"
      />

      {/* Footer / Remaining Hours */}
      <p className="text-subtle-foreground mt-3 text-xs font-normal">
        {formatHours(remainingHours)}h remaining this month
      </p>
    </section>
  )
}
