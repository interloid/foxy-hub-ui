'use client'

import { usePathname } from 'next/navigation'

import { ThemeToggle } from './theme-toggle'

const ROUTES_WITH_OWN_TOGGLE = ['/design-system', '/']

export function FloatingThemeToggle() {
  const pathname = usePathname()
  const owned = ROUTES_WITH_OWN_TOGGLE.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )

  if (owned) return null

  return (
    <div className="fixed top-4 right-4 z-50">
      <ThemeToggle />
    </div>
  )
}
