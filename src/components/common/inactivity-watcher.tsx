'use client'

import { useEffect } from 'react'

import { notifyOtherTabsOnLogout } from '@/components/common/tab-session-sync'
import { signOutInactive, touchActivity } from '@/features/settings/actions'
import {
  inactivityLimitMs,
  LAST_ACTIVITY_STORAGE_KEY,
  type InactivityTimeout,
} from '@/lib/inactivity'

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'scroll',
  'touchstart',
] as const

/** Writing on every mousemove is wasteful; once per interval is plenty. */
const RECORD_THROTTLE_MS = 15 * 1000
const CHECK_INTERVAL_MS = 30 * 1000
/** While someone works without navigating, keep proxy.ts's cookie fresh this often. */
const SERVER_TOUCH_MS = 5 * 60 * 1000

function readLastActivity(fallback: number): number {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : fallback
  } catch {
    return fallback
  }
}

function writeLastActivity(at: number) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(at))
  } catch {
    // Storage blocked (private mode) — this tab still tracks itself in memory.
  }
}

/**
 * Signs an idle tab out as soon as the user's "Sign out after inactivity" limit passes,
 * instead of waiting for their next request to reach proxy.ts. Activity is shared through
 * localStorage, so working in one tab keeps every tab alive; the sign-out itself reaches
 * the other tabs through TabSessionSync's `logout_event`.
 */
export function InactivityWatcher({ timeout }: { timeout: InactivityTimeout }) {
  useEffect(() => {
    const limit = inactivityLimitMs(timeout)
    if (limit === null) return

    let lastActivity = Date.now()
    let lastRecorded = 0
    let lastServerTouch = Date.now()
    let signingOut = false
    writeLastActivity(lastActivity)

    const record = () => {
      const now = Date.now()
      lastActivity = now
      if (now - lastRecorded < RECORD_THROTTLE_MS) return
      lastRecorded = now
      writeLastActivity(now)
    }

    const check = async () => {
      if (signingOut) return
      const now = Date.now()
      const last = Math.max(lastActivity, readLastActivity(lastActivity))

      if (now - last > limit) {
        signingOut = true
        try {
          await signOutInactive()
        } catch {
          // Offline or the server is restarting: leave anyway (RISK-028). Staying would
          // keep the app on screen on a shared machine, and proxy.ts ends the session on
          // the next request because the inactivity limit has passed.
        } finally {
          notifyOtherTabsOnLogout()
          // A full load, not router.push: nothing from the signed-in app may stay in
          // memory.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/sign-in?error=session_expired'
        }
        return
      }

      // Active since the last touch, but no request has refreshed the server's view.
      if (last > lastServerTouch && now - lastServerTouch > SERVER_TOUCH_MS) {
        lastServerTouch = now
        void touchActivity()
      }
    }

    // Background tabs have their timers throttled — check the moment one is looked at.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, record, { passive: true })
    )
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, record)
      )
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [timeout])

  return null
}
