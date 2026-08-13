'use client'

import { Toaster as UIToaster } from '@/components/ui/sonner'
import { useTheme } from '@/context/theme-provider'

export function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <UIToaster
      theme={resolvedTheme}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border-strong)',
          '--border-radius': 'var(--radius-xl)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            'cn-toast shadow-panel animate-fx-slide gap-2.5 border-border-strong px-3.5 py-[11px] text-base',
        },
      }}
    />
  )
}
