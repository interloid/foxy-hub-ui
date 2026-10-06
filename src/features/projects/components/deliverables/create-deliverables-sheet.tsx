'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import {
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronDown,
  Loader2,
  Plus,
} from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import { FxField, FxFieldError, FxLabel } from '@/components/shared/fx-field'
import {
  FxDropdownMenuContent,
  FxDropdownMenuItem,
  FxPopoverContent,
  Popover,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PopoverTrigger } from '@radix-ui/react-popover'

import { FxTextarea } from '@/components/shared/fx-textarea'
import {
  FxTooltip,
  FxTooltipContent,
  FxTooltipTrigger,
} from '@/components/shared/fx-tooltip'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { toast } from 'sonner'
import { createDelivery } from '../../actions'
import { CreateDeliveryFormValues, createDeliverySchema } from '../../schema'
import { ProjectMilestone } from '../../types'
import { useFormatter } from '@/context/locale-provider'

interface CreateDeliverySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  orgId: string
  milestones: ProjectMilestone[]
  onSuccess?: (deliveryId: string) => void
}

export function CreateDeliverySheet({
  open,
  onOpenChange,
  projectId,
  orgId,
  milestones,
  onSuccess,
}: CreateDeliverySheetProps) {
  const fmt = useFormatter()
  const [selectedMilestone, setSelectedMilestone] =
    useState<ProjectMilestone | null>(null)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CreateDeliveryFormValues>({
    resolver: zodResolver(createDeliverySchema),
    mode: 'onChange',
    defaultValues: {
      title: '',
      description: '',
      milestoneId: null,
      dueDate: '',
    },
  })

  const handleReset = () => {
    reset()
    setSelectedMilestone(null)
    setIsCalendarOpen(false)
    setServerError(null)
  }
  const { orgSlug } = useWorkspace()
  const handleMilestoneSelect = (milestone: ProjectMilestone | null) => {
    setSelectedMilestone(milestone)
    setValue('milestoneId', milestone?.id ?? null, { shouldValidate: true })

    if (milestone?.dueDate) {
      const formattedDate = milestone.dueDate.split('T')[0]
      setValue('dueDate', formattedDate, { shouldValidate: true })
    }
  }

  const onSubmit = async (values: CreateDeliveryFormValues) => {
    setServerError(null)
    try {
      const result = await createDelivery({
        projectId,
        orgId,
        title: values.title.trim(),
        orgSlug,
        description: values.description?.trim() || undefined,
        milestoneId: values.milestoneId || undefined,
        dueDate: values.dueDate,
      })

      toast.success('Deliverable created successfully')
      handleReset()
      onSuccess?.(result.data.id)
      onOpenChange(false)
    } catch (err: unknown) {
      console.error('Failed to create delivery:', err)

      // Extract server message or use default fallback
      const message =
        (err instanceof Error && err?.message) ||
        'Failed to create deliverable. Please try again.'

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
          <FxSheetTitle>Create Deliverable</FxSheetTitle>
          <FxSheetDescription>
            Add a new deliverable item for client review and sign-off.
          </FxSheetDescription>
        </FxSheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col justify-between"
        >
          <FxSheetBody className="space-y-4">
            {/* Title */}
            <FxField>
              <FxLabel htmlFor="delivery-title">
                Title <span className="text-destructive">*</span>
              </FxLabel>
              <input
                id="delivery-title"
                placeholder="e.g., Brand Guidelines v1"
                {...register('title')}
                className="border-border bg-muted text-foreground placeholder:text-subtle-foreground focus-visible:border-ring w-full rounded-md border px-3 py-2 text-[13px] outline-none"
              />
              {errors.title?.message && (
                <FxFieldError>{errors.title.message}</FxFieldError>
              )}
            </FxField>

            {/* Description */}
            <FxField>
              <FxLabel htmlFor="delivery-description">Description</FxLabel>
              <FxTextarea
                id="delivery-description"
                placeholder="Provide context or details about this deliverable..."
                {...register('description')}
                rows={3}
                variant="subtle"
                className="rounded-md border text-xs outline-none"
              />
              {errors.description?.message && (
                <FxFieldError>{errors.description.message}</FxFieldError>
              )}
            </FxField>

            {/* Milestone Dropdown */}
            <FxField>
              <FxLabel htmlFor="milestone">Milestone</FxLabel>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <FxButton
                    type="button"
                    id="milestone"
                    className="border-border bg-muted/50 text-foreground hover:bg-muted focus:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="truncate">
                      {selectedMilestone
                        ? selectedMilestone.title
                        : 'Select milestone...'}
                    </span>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                  </FxButton>
                </DropdownMenuTrigger>
                <FxDropdownMenuContent align="start" className="w-60">
                  {milestones.length <= 0 && (
                    <div
                      onClick={() => handleMilestoneSelect(null)}
                      className="text-muted-foreground px-2 py-1.5 text-[12px]"
                    >
                      No Milestone
                    </div>
                  )}
                  {milestones.map((ms) => {
                    if (ms.status !== 'completed') {
                      return (
                        <FxDropdownMenuItem
                          key={ms.id}
                          onClick={() => handleMilestoneSelect(ms)}
                          className="text-[13px]"
                        >
                          <span className="truncate">{ms.title}</span>
                        </FxDropdownMenuItem>
                      )
                    }
                  })}
                </FxDropdownMenuContent>
              </DropdownMenu>
            </FxField>

            {/* Popover Calendar Due Date */}
            <FxField>
              <FxLabel htmlFor="delivery-due-date">
                Due Date <span className="text-destructive">*</span>
              </FxLabel>
              <Controller
                control={control}
                name="dueDate"
                render={({ field }) => {
                  const selectedDate = field.value
                    ? parseISO(field.value)
                    : undefined
                  const formattedDueDate = field.value
                    ? fmt.date(field.value, 'date')
                    : 'Select due date...'

                  return (
                    <Popover
                      open={isCalendarOpen}
                      onOpenChange={setIsCalendarOpen}
                    >
                      <PopoverTrigger asChild>
                        <FxButton
                          id="delivery-due-date"
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
                          <FxTooltip>
                            <FxTooltipTrigger asChild>
                              <span className="inline-flex cursor-pointer items-center">
                                <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
                              </span>
                            </FxTooltipTrigger>
                            <FxTooltipContent side="bottom">
                              Calendar
                            </FxTooltipContent>
                          </FxTooltip>
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

            {/* Server Error Alert */}
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
                  Create Deliverable
                </>
              )}
            </FxButton>
          </FxSheetFooter>
        </form>
      </FxSheetContent>
    </Sheet>
  )
}
