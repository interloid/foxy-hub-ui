import 'server-only'

import { userAgentFromString } from 'next/server'

import type { DeviceKind } from './types'

/** ua-parser's names → the ones people recognise. */
const BROWSER_NAMES: Record<string, string> = {
  'Mobile Safari': 'Safari',
  'Mobile Chrome': 'Chrome',
  'Mobile Firefox': 'Firefox',
  'Chrome WebView': 'Chrome',
  Edge: 'Edge',
}

const OS_NAMES: Record<string, string> = {
  'Mac OS': 'macOS',
  'Chromium OS': 'ChromeOS',
}

export function describeDevice(userAgent: string | null): {
  name: string
  kind: DeviceKind
} {
  if (!userAgent) return { name: 'Unknown device', kind: 'unknown' }

  const { browser, os, device } = userAgentFromString(userAgent)

  const kind: DeviceKind =
    device.type === 'mobile'
      ? 'mobile'
      : device.type === 'tablet'
        ? 'tablet'
        : device.type === undefined
          ? 'desktop'
          : 'unknown'

  const browserName = browser.name
    ? (BROWSER_NAMES[browser.name] ?? browser.name)
    : null
  // "iPhone" / "iPad" reads better than "iOS" for Apple mobile devices.
  const platform =
    device.model === 'iPhone' || device.model === 'iPad'
      ? device.model
      : os.name
        ? (OS_NAMES[os.name] ?? os.name)
        : null

  if (browserName && platform)
    return { name: `${browserName} on ${platform}`, kind }
  if (browserName || platform) return { name: (browserName ?? platform)!, kind }
  return { name: 'Unknown device', kind: 'unknown' }
}

export function formatLocation(
  city: string | null,
  country: string | null
): string | null {
  if (city && country) return `${city}, ${country}`
  return city || country || null
}
