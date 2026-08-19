'use client'

import { useEffect } from 'react'

export function TabSessionSync() {
  useEffect(() => {
    const handleLogoutRedirect = () => {
      // Only execute if not already on the sign-in page
      if (window.location.pathname !== '/sign-in') {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/sign-in'
      }
    }

    // 1. Handle live storage events from other tabs
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'logout_event' && event.newValue !== null) {
        handleLogoutRedirect()
      }
    }

    // 2. Handle tab focus for throttled background tabs
    const handleFocus = () => {
      const logoutTimestamp = window.localStorage.getItem('logout_event')
      if (logoutTimestamp) {
        handleLogoutRedirect()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return null
}

export function notifyOtherTabsOnLogout() {
  window.localStorage.setItem('logout_event', Date.now().toString())
}

export function clearLogoutNotification() {
  window.localStorage.removeItem('logout_event')
}
