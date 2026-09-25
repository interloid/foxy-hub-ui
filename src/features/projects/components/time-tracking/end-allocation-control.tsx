'use client'

import { CalendarOff } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import {
  FxPopoverContent,
  Popover,
  PopoverTrigger,
} from '@/components/shared/fx-menu'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { toISODate } from '@/lib/date'

import { endAllocationAction } from '../../actions'

interface EndAllocationControlProps {
  allocationId: string
  projectId: string
  userName: string
  effectiveFrom: string
  effectiveTo?: string | null
}

export function EndAllocationControl({
  allocationId,
  projectId,
  userName,
  effectiveFrom,
  effectiveTo,
}: EndAllocationControlProps) {
  const { orgSlug } = useWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Already ended: show when, and stop offering to end it again.
  if (effectiveTo) {
    return (
      <span className="text-subtle-foreground text-[11px] whitespace-nowrap">
        until {effectiveTo}
      </span>
    )
  }

  const handleSelect = (date?: Date) => {
    if (!date) return

    setIsOpen(false)

    startTransition(async () => {
      const res = await endAllocationAction({
        allocationId,
        projectId,
        orgSlug,
        effectiveTo: toISODate(date),
      })

      if (!res.ok) {
        toast.error(res.error)
        return
      }

      toast.success(`${userName}'s booking ends ${toISODate(date)}`)
    })
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <FxButton
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={isPending}
          aria-label={`End ${userName}'s allocation`}
          title="End this allocation"
          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground size-7 shrink-0 bg-transparent"
        >
          <CalendarOff className="size-3.5" />
        </FxButton>
      </PopoverTrigger>
      <FxPopoverContent className="w-auto p-0" align="end">
        <FxCalendar
          mode="single"
          disabled={(date) => date < new Date(effectiveFrom + 'T00:00:00')}
          onSelect={handleSelect}
          variant="compact"
        />
      </FxPopoverContent>
    </Popover>
  )
}
