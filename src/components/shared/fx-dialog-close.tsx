import { X } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export const FX_DIALOG_CLOSE_CLASS =
  'text-muted-foreground hover:text-foreground flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-5'

export function FxDialogClose({
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'children'>) {
  return (
    <button
      type="button"
      aria-label="Close"
      className={cn(FX_DIALOG_CLOSE_CLASS, className)}
      {...props}
    >
      <X aria-hidden />
    </button>
  )
}
