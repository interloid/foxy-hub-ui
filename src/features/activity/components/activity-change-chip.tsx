import { ArrowRight } from 'lucide-react'

import type { ActivityChange } from '@/lib/activity'

/** "Status  Sent -> Paid": one change chip under an activity entry. */
export function ActivityChangeChip({ change }: { change: ActivityChange }) {
  return (
    <span className="bg-muted/60 border-border/60 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px]">
      <span className="text-muted-foreground shrink-0">{change.label}</span>
      {change.from && (
        <>
          <span className="text-muted-foreground truncate line-through">
            {change.from}
          </span>
          <ArrowRight
            className="text-muted-foreground size-3 shrink-0"
            aria-label="to"
          />
        </>
      )}
      <span className="text-foreground truncate font-semibold">
        {change.to}
      </span>
    </span>
  )
}
