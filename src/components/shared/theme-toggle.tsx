'use client'

import { type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/context/theme-provider'
import { FxButton } from './fx-button'

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

export function ThemeToggle({
  className,
  variant = 'dropdown',
}: {
  className?: string
  variant?: 'dropdown' | 'segmented' | 'button' | 'icon'
}) {
  const { theme, resolvedTheme, setTheme } = useTheme()

  const next = resolvedTheme === 'dark' ? 'light' : 'dark'

  if (variant === 'dropdown') {
    const current =
      OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2]
    const TriggerIcon = current.Icon

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Theme: ${current.label}`}
          className={cn(
            'border-border bg-background text-muted-foreground flex size-8.5 shrink-0 items-center justify-center rounded-md border',
            'hover:text-foreground transition-colors duration-(--duration-fast)',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            className
          )}
        >
          <TriggerIcon size={17} strokeWidth={1.6} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
          >
            {OPTIONS.map(({ value, label, Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon className="size-4" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

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
