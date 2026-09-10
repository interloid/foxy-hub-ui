'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Loader2,
  Plus,
} from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import { FxField, FxFieldError, FxLabel } from '@/components/shared/fx-field'
import {
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
  Sheet,
} from '@/components/shared/fx-sheet'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { createMilestone } from '../../actions'
import { CreateMilestoneFormValues, createMilestoneSchema } from '../../schema'

interface CreateMilestoneSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  orgId: string
  onSuccess?: () => void
}

export function CreateMilestoneSheet({
  open,
  onOpenChange,
  projectId,
  orgId,
  onSuccess,
}: CreateMilestoneSheetProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CreateMilestoneFormValues>({
    resolver: zodResolver(createMilestoneSchema),
    mode: 'onChange',
    defaultValues: {
      title: '',
      dueDate: '',
    },
  })

  const handleReset = () => {
    reset()
    setIsCalendarOpen(false)
    setServerError(null)
  }
  const { orgSlug } = useWorkspace()

  const onSubmit = async (values: CreateMilestoneFormValues) => {
    setServerError(null)

    try {
      await createMilestone({
        projectId,
        orgId,
        orgSlug,
        title: values.title.trim(),
        dueDate: values.dueDate,
        status: 'pending', // Explicitly setting default status
      })

      toast.success('Milestone created successfully')
      handleReset()
      onSuccess?.()
      onOpenChange(false)
    } catch (err: unknown) {
      console.error('Failed to create milestone:', err)
      const message =
        (err instanceof Error && err?.message) ||
        'Failed to create milestone. Please try again.'
      setServerError(message)
      toast.error(message)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleReset()
        onOpenChange(nextOpen)
      }}
    >
      <FxSheetContent>
        <FxSheetHeader>
          <FxSheetTitle>Create Milestone</FxSheetTitle>
          <FxSheetDescription>
            Add a new milestone event or target date for this project.
          </FxSheetDescription>
        </FxSheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col justify-between"
        >
          <FxSheetBody className="space-y-4">
            {/* Title */}
            <FxField>
              <FxLabel htmlFor="milestone-title">
                Title <span className="text-destructive">*</span>
              </FxLabel>
              <input
                id="milestone-title"
                placeholder="e.g., Phase 1 Design Handoff"
                {...register('title')}
                className="border-border bg-muted text-foreground placeholder:text-subtle-foreground focus-visible:border-ring w-full rounded-md border px-3 py-2 text-[13px] outline-none"
              />
              {errors.title?.message && (
                <FxFieldError>{errors.title.message}</FxFieldError>
              )}
            </FxField>

            <FxField>
              <FxLabel htmlFor="milestone-due-date">
                Due Date <span className="text-destructive">*</span>
              </FxLabel>
              <Controller
                control={control}
                name="dueDate"
                render={({ field }) => {
                  const selectedDate = field.value
                    ? parseISO(field.value)
                    : undefined
                  const formattedDueDate = selectedDate
                    ? format(selectedDate, 'MMM d, yyyy')
                    : 'Select due date...'

                  return (
                    <Popover
                      open={isCalendarOpen}
                      onOpenChange={setIsCalendarOpen}
                    >
                      <PopoverTrigger asChild>
                        <FxButton
                          id="milestone-due-date"
                          type="button"
                          className="border-border bg-muted text-foreground hover:bg-muted flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] font-normal outline-none"
                        >
                          <span
                            className={
                              !field.value
                                ? 'text-subtle-foreground'
                                : 'text-foreground'
                            }
                          >
                            {formattedDueDate}
                          </span>
                          <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
                        </FxButton>
                      </PopoverTrigger>
                      <FxPopoverContent className="w-auto p-0" align="start">
                        <FxCalendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => {
                            field.onChange(
                              date ? format(date, 'yyyy-MM-dd') : ''
                            )
                            setIsCalendarOpen(false)
                          }}
                          variant="compact"
                        />
                      </FxPopoverContent>
                    </Popover>
                  )
                }}
              />
              {errors.dueDate?.message && (
                <FxFieldError>{errors.dueDate.message}</FxFieldError>
              )}
            </FxField>

            {/* Inline Server Error Alert */}
            {serverError && (
              <div className="border-destructive/30 bg-destructive-subtle text-destructive flex items-center gap-2 rounded-md border p-2.5 text-xs">
                <AlertCircle className="size-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}
          </FxSheetBody>

          {/* Footer Actions */}
          <FxSheetFooter className="justify-end gap-2">
            <FxButton
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </FxButton>
            <FxButton type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 size-3.5" />
                  Create Milestone
                </>
              )}
            </FxButton>
          </FxSheetFooter>
        </form>
      </FxSheetContent>
    </Sheet>
  )
}
