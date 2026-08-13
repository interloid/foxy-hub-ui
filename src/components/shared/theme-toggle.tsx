'use client'

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

import { FxButton } from './fx-button'
import { useTheme } from '@/context/theme-provider'

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

export function ThemeToggle({
  className,
  variant = 'segmented',
}: {
  className?: string
  variant?: 'segmented' | 'button' | 'icon'
}) {
  // `theme` is backed by useSyncExternalStore in the provider, so it reflects the
  // stored preference from the first client render (and matches the server snapshot
  // during hydration) — no mounted guard needed to avoid a mismatch on aria-pressed.
  const { theme, resolvedTheme, setTheme } = useTheme()

  const next = resolvedTheme === 'dark' ? 'light' : 'dark'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} theme`}
        className={cn(
          'border-border bg-muted text-muted-foreground flex size-8.5 shrink-0 items-center justify-center rounded-md border',
          'hover:text-foreground transition-colors duration-(--duration-fast)',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          className
        )}
      >
        <Sun size={17} strokeWidth={1.6} />
      </button>
    )
  }

  if (variant === 'button') {
    return (
      <FxButton
        variant="secondary"
        // 14px of padding and `shadow-card` are v2's, per treatments.md § 12 — the
        // `secondary` variant is otherwise an exact match.
        className={cn('shadow-card gap-1.75 px-3.5', className)}
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} theme`}
      >
        {next === 'dark' ? 'Dark' : 'Light'}
      </FxButton>
    )
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        'border-border bg-background inline-flex items-center gap-1 rounded-lg border p-1',
        className
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            title={label}
            className={cn(
              'text-muted-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors',
              'hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              active && 'bg-muted text-foreground'
            )}
          >
            <Icon className="size-4" />
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
