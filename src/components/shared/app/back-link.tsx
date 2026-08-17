import { ChevronLeftIcon } from 'lucide-react'
import { Slot } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

function BackLink({
  className,
  children,
  asChild = false,
  ...props
}: React.ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'a'

  return (
    <Comp
      data-slot="back-link"
      className={cn(
        'text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5 text-base transition-colors duration-(--duration-fast)',
        className
      )}
      {...props}
    >
      <ChevronLeftIcon className="size-3.75" strokeWidth={1.8} />
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
    </Comp>
  )
}

export { BackLink }
