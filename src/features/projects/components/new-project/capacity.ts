import { toISODate } from '@/lib/date'
import { readAmount, type AllocationValues } from './schema'
import type { NewProjectMember } from './types'

export interface OverCommitment {
  memberId: string
  name: string
  totalHoursPerDay: number
  maxHoursPerDay: number
}

export function capacityKey(memberId: string, date: Date): string {
  return `${memberId}:${toISODate(date)}`
}

// Each row is checked against what the person is already booked for on the day it starts,
// the same rule `createProjectFromWizard` enforces on the server. The wizard allows one
// row per teammate, so each over-committed person is reported once.
export function getOverCommitments(
  allocations: AllocationValues[],
  existingHours: Record<string, number>,
  members: NewProjectMember[],
  maxHoursPerDay: number
): OverCommitment[] {
  const worstByMember = new Map<string, OverCommitment>()

  for (const row of allocations) {
    const hours = readAmount(row.hoursPerDay)
    if (!row.memberId || !row.effectiveFrom || !hours || Number.isNaN(hours)) {
      continue
    }

    const existing =
      existingHours[capacityKey(row.memberId, row.effectiveFrom)] ?? 0
    const total = existing + hours
    if (total <= maxHoursPerDay) continue

    const current = worstByMember.get(row.memberId)
    if (!current || total > current.totalHoursPerDay) {
      worstByMember.set(row.memberId, {
        memberId: row.memberId,
        name: members.find((m) => m.id === row.memberId)?.name ?? 'Teammate',
        totalHoursPerDay: total,
        maxHoursPerDay,
      })
    }
  }

  return [...worstByMember.values()]
}
