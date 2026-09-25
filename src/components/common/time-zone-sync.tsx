'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { recordDeviceTimeZone } from '@/features/settings/actions'
import { deviceTimeZone, TIME_ZONE_COOKIE } from '@/lib/time-zone'

const ONE_YEAR = 60 * 60 * 24 * 365

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : null
}

export function TimeZoneSync({
  manualTimeZone,
  lastDeviceTimeZone,
}: {
  manualTimeZone: string | null
  /** What the account last recorded — the weekly digest's zone in automatic mode. */
  lastDeviceTimeZone: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    const zone = deviceTimeZone()

    // Remember it on the account (only when it changed) so a background job — the weekly
    // digest — knows this person's zone without a browser to ask.
    if (zone !== lastDeviceTimeZone) void recordDeviceTimeZone(zone)

    if (readCookie(TIME_ZONE_COOKIE) === zone) return

    const secure = window.location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${TIME_ZONE_COOKIE}=${zone}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`

    // A manual zone wins on the server anyway, so there is nothing to recompute.
    if (!manualTimeZone) router.refresh()
  }, [manualTimeZone, lastDeviceTimeZone, router])

  return null
}
