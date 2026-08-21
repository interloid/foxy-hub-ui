import { FloatingThemeToggle } from '@/components/shared/floating-theme-toggle'

export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <FloatingThemeToggle />
      {children}
    </>
  )
}
