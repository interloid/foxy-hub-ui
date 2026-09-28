import type { BillingCycle, BillingPlan, PlanOption } from '../types'

export type PlanChangeTiming = 'none' | 'now' | 'period_end'

export type PlanChangeQuote =
  | { timing: 'none' }
  | {
      timing: 'now'
      target: PlanOption
      cycle: BillingCycle
      newPrice: number
      credit: number
      dueNow: number
      leftoverCredit: number
      renewsAt: string
      downgrade: boolean
      notEnoughSeats: boolean
    }
  | {
      timing: 'period_end'
      target: PlanOption
      cycle: BillingCycle
      newPrice: number
      effectiveAt: string
      notEnoughSeats: boolean
    }

const DAY = 24 * 60 * 60 * 1000

export function priceFor(plan: PlanOption, cycle: BillingCycle): number {
  return cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice
}

export function changeTiming(
  current: { rank: number; cycle: BillingCycle },
  target: { rank: number; cycle: BillingCycle }
): PlanChangeTiming {
  if (target.rank > current.rank) return 'now'
  if (target.rank < current.rank) {
    return current.cycle === 'monthly' && target.cycle === 'yearly'
      ? 'now'
      : 'period_end'
  }
  if (target.cycle === current.cycle) return 'none'
  return target.cycle === 'yearly' ? 'now' : 'period_end'
}

function toUtcDay(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function addPeriod(fromMs: number, cycle: BillingCycle): string {
  const date = new Date(fromMs)
  if (cycle === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1)
  else date.setUTCMonth(date.getUTCMonth() + 1)
  return isoDay(date.getTime())
}

const cents = (value: number) => Math.round(value * 100) / 100

/** The unused share of the current period's price, as of `today`. */
export function unusedCredit(plan: BillingPlan, today: Date): number {
  if (!plan.periodStart || !plan.renewsAt) return 0
  const start = toUtcDay(plan.periodStart)
  const end = toUtcDay(plan.renewsAt)
  const now = toUtcDay(today.toISOString())
  const periodDays = Math.round((end - start) / DAY)
  const remainingDays = Math.min(
    Math.max(Math.round((end - now) / DAY), 0),
    periodDays
  )
  if (periodDays <= 0) return 0
  return cents((plan.price * remainingDays) / periodDays)
}

export function quotePlanChange({
  current,
  plans,
  target,
  cycle,
  today = new Date(),
}: {
  current: BillingPlan
  plans: PlanOption[]
  target: PlanOption
  cycle: BillingCycle
  today?: Date
}): PlanChangeQuote {
  const currentOption = plans.find((p) => p.id === current.planId)
  const timing = changeTiming(
    { rank: currentOption?.rank ?? 0, cycle: current.cycle },
    { rank: target.rank, cycle }
  )
  const newPrice = priceFor(target, cycle)

  if (timing === 'none') return { timing }

  if (timing === 'period_end') {
    return {
      timing,
      target,
      cycle,
      newPrice,
      effectiveAt: current.renewsAt ?? isoDay(today.getTime()),
      notEnoughSeats: target.seats < current.usedSeats,
    }
  }

  const credit = unusedCredit(current, today)
  return {
    timing,
    target,
    cycle,
    newPrice,
    credit,
    dueNow: cents(Math.max(newPrice - credit, 0)),
    leftoverCredit: cents(Math.max(credit - newPrice, 0)),
    renewsAt: addPeriod(toUtcDay(today.toISOString()), cycle),
    downgrade: target.rank < (currentOption?.rank ?? 0),
    notEnoughSeats:
      target.rank < (currentOption?.rank ?? 0) &&
      target.seats < current.usedSeats,
  }
}
