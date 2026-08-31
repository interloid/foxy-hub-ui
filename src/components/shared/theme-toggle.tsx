'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme } from '@/context/theme-provider'
import { type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { FxButton } from './fx-button'
import { FxTooltipContent } from './fx-tooltip'

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
      <TooltipProvider>
        <Tooltip>
          <DropdownMenu>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger
                aria-label={`Theme: ${current.label}`}
                className={cn(
                  'bg-background text-muted-foreground flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-md',
                  'hover:text-foreground transition-colors duration-(--duration-fast)',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                  className
                )}
              >
                <TriggerIcon size={17} strokeWidth={1.6} />
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as Theme)}
              >
                {OPTIONS.map(({ value, label, Icon }) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    className="cursor-pointer"
                  >
                    <Icon className="size-4" />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <FxTooltipContent side="bottom">
            <p>Theme</p>
          </FxTooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setTheme(next)}
              aria-label={`Switch to ${next} theme`}
              className={cn(
                'bg-muted text-muted-foreground flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-md',
                'hover:text-foreground transition-colors duration-(--duration-fast)',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                className
              )}
            >
              <Sun size={17} strokeWidth={1.6} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Switch to {next} mode</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (variant === 'button') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <FxButton
              variant="secondary"
              className={cn(
                'shadow-card cursor-pointer gap-1.75 border-none px-3.5',
                className
              )}
              onClick={() => setTheme(next)}
              aria-label={`Switch to ${next} theme`}
            >
              {next === 'dark' ? 'Dark' : 'Light'}
            </FxButton>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Switch to {next} mode</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
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
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={active}
                  className={cn(
                    'text-muted-foreground inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors',
                    'hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                    active && 'bg-muted text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  <span className="sr-only">{label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{label} theme</p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
