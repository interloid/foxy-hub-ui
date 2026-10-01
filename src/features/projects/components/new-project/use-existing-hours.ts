'use client'

import { toISODate } from '@/lib/date'
import { useEffect, useState } from 'react'
import { capacityKey } from './capacity'
import type { AllocationValues } from './schema'

interface TeammateCapacityResponse {
  existingHoursPerDay?: number
}

// Fetches each teammate's existing hours/day on their row's start date, once per
// (teammate, date) pair. The server re-checks capacity on create, so this only drives the
// over-commitment warning.
export function useExistingHours(
  orgSlug: string,
  allocations: AllocationValues[]
): Record<string, number> {
  const [existingHours, setExistingHours] = useState<Record<string, number>>({})

  const pending = allocations
    .filter((row) => row.memberId && row.effectiveFrom)
    .map((row) => ({
      key: capacityKey(row.memberId, row.effectiveFrom),
      memberId: row.memberId,
      dateStr: toISODate(row.effectiveFrom),
    }))
    .filter((item) => !(item.key in existingHours))

  // A stable string so the effect only re-runs when a new pair appears.
  const pendingKey = [...new Set(pending.map((item) => item.key))].join('|')

  useEffect(() => {
    if (!pendingKey) return
    let cancelled = false

    const pairs = pendingKey.split('|').map((key) => {
      const [memberId, dateStr] = key.split(':')
      return { key, memberId, dateStr }
    })

    Promise.all(
      pairs.map(async ({ key, memberId, dateStr }) => {
        try {
          const query = new URLSearchParams({
            type: 'teammate-capacity',
            userId: memberId,
            orgSlug,
            dateStr,
          })
          const res = await fetch(`/api/dashboard/sheet-data?${query}`)
          if (!res.ok) return [key, 0] as const
          const data: TeammateCapacityResponse = await res.json()
          return [key, data.existingHoursPerDay ?? 0] as const
        } catch (err) {
          console.error('Failed to check teammate capacity', err)
          return [key, 0] as const
        }
      })
    ).then((entries) => {
      if (cancelled) return
      setExistingHours((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    })

    return () => {
      cancelled = true
    }
  }, [pendingKey, orgSlug])

  return existingHours
}
