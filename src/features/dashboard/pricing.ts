import {
  fromISODate,
  WEEKS_PER_MONTH,
  workingDaysBetween,
} from '@/lib/working-days'

export interface PricingAllocation {
  userId: string
  hoursPerDay: number
  daysPerWk: number
  rate?: number
  effectiveFrom: string
}

export interface PricingInputs {
  engagement: string
  budget?: string
  fixedPrice?: string
  estimatedHours?: string
  retainerBucketHours?: string
  retainerAmount?: string
  retainerPeriod?: string
  allocations: PricingAllocation[]
  memberCosts: Map<string, number | null>
  targetDate?: Date
  targetMargin?: number
}

export interface BurnRate {
  perDay: number
  perWeek: number
  perMonth: number
}

export interface PricingSuggestion {
  amount: number
  basis: string
}

export type PricingWarningKind =
  | 'negative-margin'
  | 'below-cost'
  | 'budget-short'
  | 'over-bucket'
  | 'order-of-magnitude'

export interface PricingWarning {
  kind: PricingWarningKind
  message: string
}

export interface PricingInsight {
  suggestion: PricingSuggestion | null
  burnRate: BurnRate | null
  warnings: PricingWarning[]
}

const DEFAULT_TARGET_MARGIN = 0.4

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function readNumber(raw?: string): number | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (trimmed === '') return null

  const parsed = Number(trimmed)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function staffed(allocations: PricingAllocation[]): PricingAllocation[] {
  return allocations.filter((row) => row.userId && Number(row.hoursPerDay) > 0)
}

function blendedRate(
  rows: PricingAllocation[],
  rateOf: (row: PricingAllocation) => number | null | undefined
): number | null {
  let hours = 0
  let weighted = 0

  for (const row of rows) {
    const rate = rateOf(row)

    if (rate === null || rate === undefined) return null

    hours += row.hoursPerDay
    weighted += row.hoursPerDay * rate
  }

  return hours > 0 ? weighted / hours : null
}

function billBurnRate(rows: PricingAllocation[]): BurnRate | null {
  let perDay = 0
  let perWeek = 0

  for (const row of rows) {
    if (row.rate === undefined || row.rate === null) return null

    perDay += row.hoursPerDay * row.rate
    perWeek += row.hoursPerDay * row.daysPerWk * row.rate
  }

  return perDay > 0
    ? {
        perDay: round2(perDay),
        perWeek: round2(perWeek),
        perMonth: round2(perWeek * WEEKS_PER_MONTH),
      }
    : null
}

function plannedBillTotal(
  rows: PricingAllocation[],
  targetDate: Date
): { total: number; workingDays: number } | null {
  let total = 0
  let longestSpan = 0

  for (const row of rows) {
    if (row.rate === undefined || row.rate === null) return null

    const start = fromISODate(row.effectiveFrom)
    const days = workingDaysBetween(start, targetDate, row.daysPerWk)

    longestSpan = Math.max(longestSpan, days)
    total += days * row.hoursPerDay * row.rate
  }

  return total > 0 ? { total: round2(total), workingDays: longestSpan } : null
}

function orderOfMagnitude(
  entered: number,
  suggested: number
): PricingWarning | null {
  if (suggested <= 0) return null

  if (entered * 10 <= suggested) {
    return {
      kind: 'order-of-magnitude',
      message:
        'This looks far below the suggested amount check for a missing zero.',
    }
  }

  if (entered >= suggested * 10) {
    return {
      kind: 'order-of-magnitude',
      message:
        'This looks far above the suggested amount check for an extra zero.',
    }
  }

  return null
}

export function computePricingInsight(inputs: PricingInputs): PricingInsight {
  const {
    engagement,
    allocations,
    memberCosts,
    targetDate,
    targetMargin = DEFAULT_TARGET_MARGIN,
  } = inputs

  const rows = staffed(allocations)
  const empty: PricingInsight = {
    suggestion: null,
    burnRate: null,
    warnings: [],
  }

  if (rows.length === 0) return empty

  const costOf = (row: PricingAllocation) => memberCosts.get(row.userId) ?? null
  const blendedCost = blendedRate(rows, costOf)
  const blendedBill = blendedRate(rows, (row) => row.rate)

  const isFullOrPart =
    engagement === 'full_time' ||
    engagement === 'full-time' ||
    engagement === 'part_time' ||
    engagement === 'part-time'

  const isFixed = engagement === 'fixed' || engagement === 'fixed-price'
  const isRetainer = engagement === 'retainer'

  const warnings: PricingWarning[] = []

  if (isFullOrPart) {
    const entered = readNumber(inputs.budget)
    const burn = billBurnRate(rows)
    const planned = targetDate ? plannedBillTotal(rows, targetDate) : null

    if (planned && entered !== null && entered < planned.total) {
      warnings.push({
        kind: 'budget-short',
        message:
          'This budget runs out before the target date at the planned staffing.',
      })
    }

    if (planned && entered !== null) {
      const magnitude = orderOfMagnitude(entered, planned.total)
      if (magnitude) warnings.push(magnitude)
    }

    return {
      suggestion: planned
        ? {
            amount: planned.total,
            basis: `${planned.workingDays} working days of the planned staffing`,
          }
        : null,
      // Only offered when there is no total to give instead.
      burnRate: planned ? null : burn,
      warnings,
    }
  }

  if (isFixed) {
    const entered = readNumber(inputs.fixedPrice)
    const estimated = readNumber(inputs.estimatedHours)

    const plannedCost =
      estimated !== null && blendedCost !== null
        ? estimated * blendedCost
        : null

    if (plannedCost !== null && entered !== null && entered < plannedCost) {
      warnings.push({
        kind: 'negative-margin',
        message:
          'This fee is below what the work costs to deliver the project would run at a loss.',
      })
    }

    const suggested =
      plannedCost !== null && targetMargin < 1
        ? round2(plannedCost / (1 - targetMargin))
        : null

    if (suggested !== null && entered !== null) {
      const magnitude = orderOfMagnitude(entered, suggested)
      if (magnitude) warnings.push(magnitude)
    }

    return {
      suggestion: suggested
        ? {
            amount: suggested,
            basis: `${estimated} h of work at team cost, ${Math.round(targetMargin * 100)}% margin`,
          }
        : null,
      burnRate: null,
      warnings,
    }
  }

  if (isRetainer) {
    const bucket = readNumber(inputs.retainerBucketHours)
    const entered = readNumber(inputs.retainerAmount)
    const isWeekly = inputs.retainerPeriod === 'Weekly'

    if (bucket !== null && entered !== null) {
      const impliedRate = entered / bucket

      if (blendedCost !== null && impliedRate < blendedCost) {
        warnings.push({
          kind: 'below-cost',
          message:
            'This retainer is below what the team costs the project would run at a loss.',
        })
      }
    }

    if (bucket !== null) {
      const hoursPerPeriod = rows.reduce(
        (sum, row) =>
          sum +
          row.hoursPerDay * row.daysPerWk * (isWeekly ? 1 : WEEKS_PER_MONTH),
        0
      )

      if (hoursPerPeriod > bucket) {
        warnings.push({
          kind: 'over-bucket',
          message:
            'The planned staffing needs more hours than the bucket covers.',
        })
      }
    }

    const suggested =
      bucket !== null && blendedBill !== null
        ? round2(bucket * blendedBill)
        : null

    if (suggested !== null && entered !== null) {
      const magnitude = orderOfMagnitude(entered, suggested)
      if (magnitude) warnings.push(magnitude)
    }

    return {
      suggestion: suggested
        ? {
            amount: suggested,
            basis: `${bucket} h bucket at the team's blended rate`,
          }
        : null,
      burnRate: null,
      warnings,
    }
  }

  return empty
}
