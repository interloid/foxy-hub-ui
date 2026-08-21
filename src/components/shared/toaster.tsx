'use client'

import { Toaster as UIToaster } from '@/components/ui/sonner'
import { useTheme } from '@/context/theme-provider'
import { ToasterProps } from 'sonner'

export function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <UIToaster
      {...props}
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
