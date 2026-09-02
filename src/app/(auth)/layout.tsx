import { FloatingThemeToggle } from '@/components/shared/floating-theme-toggle'
import { ReactNode } from 'react'

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FloatingThemeToggle />
      {children}
    </>
  )
}
