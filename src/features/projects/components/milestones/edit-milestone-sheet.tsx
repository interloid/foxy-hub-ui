'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import { FxField, FxInput, FxLabel } from '@/components/shared/fx-field'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  FxDropdownMenuContent,
  FxDropdownMenuItem,
  FxPopoverContent,
  Popover,
  PopoverTrigger,
} from '@/components/shared/fx-menu'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
} from '@/components/shared/fx-sheet'
import { Sheet } from '@/components/ui/sheet'
import { toISODate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { parseISO } from 'date-fns'
import { CalendarIcon, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { updateMilestoneWithValidation } from '../../actions'
import { MilestoneItem, MilestoneStatus } from '../../types/milestone'
import { useFormatter } from '@/context/locale-provider'

interface EditMilestoneSheetProps {
  milestone: MilestoneItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (updatedMilestone: MilestoneItem) => void
}

const STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export function EditMilestoneSheet({
  milestone,
  open,
  onOpenChange,
  onSuccess,
}: EditMilestoneSheetProps) {
  const fmt = useFormatter()
  const [prevMilestoneId, setPrevMilestoneId] = useState<string | null>(null)

  const [title, setTitle] = useState(milestone?.title ?? '')
  const [dueDate, setDueDate] = useState(
    milestone?.dueDate ? toISODate(new Date(milestone.dueDate)) : ''
  )
  const [status, setStatus] = useState<MilestoneStatus>(
    milestone?.status ?? 'pending'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Sync component state when a different milestone is selected
  if (milestone && milestone.id !== prevMilestoneId) {
    setPrevMilestoneId(milestone.id)
    setTitle(milestone.title ?? '')
    setDueDate(milestone.dueDate ? toISODate(new Date(milestone.dueDate)) : '')
    setStatus(milestone.status ?? 'pending')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!milestone) return

    try {
      setIsSubmitting(true)

      const updatedMilestone = await updateMilestoneWithValidation({
        milestoneId: milestone.id,
        projectId: milestone.projectId,
        title,
        dueDate,
        status,
      })

      toast.success('Milestone updated successfully!')

      if (onSuccess) {
        onSuccess(updatedMilestone)
      }

      onOpenChange(false)
    } catch (error) {
      console.error('Update failed:', error)

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update milestone.'

      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent>
        <FxSheetHeader>
          <FxSheetTitle>Edit Milestone</FxSheetTitle>
          <FxSheetDescription>
            Update details for this project milestone.
          </FxSheetDescription>
        </FxSheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col justify-between overflow-hidden"
        >
          <FxSheetBody className="space-y-2">
            {/* Title Field */}
            <FxField>
              <FxLabel htmlFor="title">Title</FxLabel>
              <FxInput
                id="title"
                type="text"
                disabled={milestone?.status === 'completed'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Milestone title"
                className="h-9"
              />
            </FxField>

            {/* Due Date Field */}
            <FxField>
              <FxLabel htmlFor="dueDate">Due Date</FxLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    id="dueDate"
                    type="button"
                    disabled={milestone?.status === 'completed'}
                    className={cn(
                      'border-input bg-background text-foreground focus:ring-ring flex h-9 w-full cursor-pointer items-center justify-between rounded-md border px-3 text-sm focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                      !dueDate && 'text-muted-foreground'
                    )}
                  >
                    <span>
                      {dueDate ? fmt.date(dueDate, 'long') : 'Pick a due date'}
                    </span>
                    <CalendarIcon className="size-4 opacity-50" />
                  </button>
                </PopoverTrigger>
                <FxPopoverContent className="w-auto p-0" align="start">
                  <FxCalendar
                    mode="single"
                    selected={dueDate ? parseISO(dueDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        // The calendar's LOCAL date — toISOString() would convert to UTC
                        // first and save the previous day anywhere east of Greenwich.
                        setDueDate(toISODate(date))
                      } else {
                        setDueDate('')
                      }
                    }}
                  />
                </FxPopoverContent>
              </Popover>
            </FxField>

            <FxField>
              <FxLabel htmlFor="status">Status</FxLabel>
              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                  disabled={milestone?.status === 'completed'}
                >
                  <button
                    id="status"
                    type="button"
                    disabled={milestone?.status === 'completed'}
                    className="border-input bg-background text-foreground focus:ring-ring flex h-10 w-full cursor-pointer items-center justify-between rounded-md border px-3 text-sm focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>{STATUS_LABELS[status]}</span>
                    <ChevronDown className="size-4 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <FxDropdownMenuContent align="start" className="w-60">
                  <FxDropdownMenuItem onClick={() => setStatus('in_progress')}>
                    In Progress
                  </FxDropdownMenuItem>
                  <FxDropdownMenuItem onClick={() => setStatus('completed')}>
                    Completed
                  </FxDropdownMenuItem>
                </FxDropdownMenuContent>
              </DropdownMenu>
            </FxField>
          </FxSheetBody>

          <FxSheetFooter>
            <FxButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {milestone?.status !== 'completed' ? 'Cancel' : 'Close'}
            </FxButton>
            {milestone?.status !== 'completed' && (
              <FxButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </FxButton>
            )}
          </FxSheetFooter>
        </form>
      </FxSheetContent>
    </Sheet>
  )
}
