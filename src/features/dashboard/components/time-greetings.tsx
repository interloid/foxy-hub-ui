'use client'

import * as React from 'react'

function getTimeBasedGreeting(): string {
  if (typeof window === 'undefined') return 'Good day'

  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 22) return 'Good evening'

  return 'Good night'
}

function useClientGreeting() {
  return React.useSyncExternalStore(
    () => () => {},
    () => getTimeBasedGreeting(),
    () => 'Good day'
  )
}

export function TimeGreeting({ userName }: { userName: string | null }) {
  const greeting = useClientGreeting()
  const firstName = userName?.trim().split(/\s+/)[0]

  return (
    <h1 className="text-foreground text-[24px] font-medium tracking-tight">
      {greeting}
      {firstName ? `, ${firstName}` : ''}
    </h1>
  )
}
