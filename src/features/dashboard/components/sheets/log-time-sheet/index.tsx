'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  FxDropdownMenuContent,
  FxDropdownMenuItem,
  FxPopoverContent,
  Popover,
  PopoverTrigger,
} from '@/components/shared/fx-menu'

import { FxLabel } from '@/components/shared/fx-field'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
} from '@/components/shared/fx-sheet'
import { FxTextarea } from '@/components/shared/fx-textarea'
import {
  createTimeEntry,
  MilestoneOption,
  ProjectOption,
} from '@/features/dashboard/actions'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { toISODate } from '@/lib/date'
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { DurationInput } from './duration-input'

interface LogTimeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogTimeSheet({ open, onOpenChange }: LogTimeSheetProps) {
  // Database Options State
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [milestones, setMilestones] = useState<MilestoneOption[]>([])

  const { orgSlug } = useWorkspace()

  // Form State
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(
    null
  )
  const [selectedMilestone, setSelectedMilestone] =
    useState<MilestoneOption | null>(null)
  const [duration, setDuration] = useState('')
  const [description, setDescription] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())

  // Capacity & UI State
  const [dailyCapacityHours, setDailyCapacityHours] = useState(8)
  const [alreadyLoggedMinutes, setAlreadyLoggedMinutes] = useState(0)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [hasDurationError, setHasDurationError] = useState(false)

  const [isPending, startTransition] = useTransition()

  // Reset form when modal opens
  const resetForm = () => {
    setSelectedProject(null)
    setSelectedMilestone(null)
    setDuration('')
    setDescription('')
    setSelectedDate(new Date())
    setHasDurationError(false)
  }

  // Load Projects once when sheet opens
  useEffect(() => {
    if (!open) return

    const controller = new AbortController()

    fetch('/api/dashboard/sheet-data?type=projects', {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err)
      })

    return () => controller.abort()
  }, [open])

  // Fetch Daily Capacity when date changes (with AbortController to prevent race conditions)
  useEffect(() => {
    if (!open || !selectedDate) return

    const controller = new AbortController()
    const dateStr = toISODate(selectedDate)

    fetch(
      `/api/dashboard/sheet-data?type=capacity&orgSlug=${orgSlug}&dateStr=${dateStr}`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((data) => {
        setDailyCapacityHours(data.dailyCapacityHours ?? 8)
        setAlreadyLoggedMinutes(data.alreadyLoggedMinutes ?? 0)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err)
      })

    return () => controller.abort()
  }, [open, selectedDate, orgSlug])

  // Fetch Milestones when project changes
  const handleProjectSelect = (project: ProjectOption) => {
    setSelectedProject(project)
    setSelectedMilestone(null)

    fetch(`/api/dashboard/sheet-data?type=milestones&projectId=${project.id}`)
      .then((res) => res.json())
      .then((msList) => setMilestones(msList))
      .catch(console.error)
  }

  const handleLogTime = () => {
    if (
      !selectedProject ||
      !selectedDate ||
      !duration.trim() ||
      !description.trim()
    ) {
      return
    }

    const dateStr = toISODate(selectedDate)

    startTransition(async () => {
      const res = await createTimeEntry({
        orgSlug,
        projectId: selectedProject.id,
        milestoneId: selectedMilestone?.id,
        workDate: dateStr,
        durationStr: duration,
        description,
      })

      if (res.ok) {
        toast.success('Time entry logged as draft!')
        resetForm()
        onOpenChange(false)
      } else {
        toast.error(res.error || 'Failed to log time entry. Please try again.')
      }
    })
  }

  const formattedDate = selectedDate
    ? selectedDate.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
    : 'Select date'

  const isSubmitDisabled =
    isPending ||
    hasDurationError ||
    !selectedProject ||
    !duration.trim() ||
    !description.trim()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent>
        {/* Header */}
        <FxSheetHeader>
          <FxSheetTitle>Log time</FxSheetTitle>
          <FxSheetDescription>
            Record hours against a project and milestone.
          </FxSheetDescription>
        </FxSheetHeader>

        {/* Form Body */}
        <FxSheetBody className="space-y-4">
          {/* Project & Milestone Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Project Dropdown */}
            <div className="w-full">
              <FxLabel
                htmlFor="project"
                className="text-foreground mb-2 block text-[13px] font-medium"
              >
                Project <span className="text-destructive">*</span>
              </FxLabel>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <FxButton
                    id="project"
                    type="button"
                    className="border-border bg-muted/50 text-foreground hover:bg-muted focus:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-1"
                  >
                    <span className="truncate">
                      {selectedProject
                        ? selectedProject.name
                        : 'Select project...'}
                    </span>

                    <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                  </FxButton>
                </DropdownMenuTrigger>

                <FxDropdownMenuContent align="start" className="w-60">
                  {projects.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-1.5 text-[12px]">
                      No projects found
                    </div>
                  ) : (
                    projects.map((proj) => (
                      <FxDropdownMenuItem
                        key={proj.id}
                        onClick={() => handleProjectSelect(proj)}
                        className="hover:bg-primary! focus:bg-muted text-[13px]"
                      >
                        {proj.name}
                      </FxDropdownMenuItem>
                    ))
                  )}
                </FxDropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Milestone Dropdown */}
            <div className="w-full">
              <FxLabel
                htmlFor="milestone"
                className="text-foreground mb-2 block text-[13px] font-medium"
              >
                Milestone
              </FxLabel>
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!selectedProject}>
                  <FxButton
                    type="button"
                    id="milestone"
                    disabled={!selectedProject}
                    className="border-border bg-muted/50 text-foreground hover:bg-muted focus:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="truncate">
                      {!selectedProject
                        ? 'Select project first'
                        : selectedMilestone
                          ? selectedMilestone.title
                          : 'Select milestone...'}
                    </span>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                  </FxButton>
                </DropdownMenuTrigger>
                <FxDropdownMenuContent align="start" className="w-60">
                  {milestones.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-1.5 text-[12px]">
                      No milestones for this project
                    </div>
                  ) : (
                    milestones.map((ms) => (
                      <FxDropdownMenuItem
                        key={ms.id}
                        onClick={() => setSelectedMilestone(ms)}
                        className="hover:bg-primary! focus:bg-muted text-[13px]"
                      >
                        {ms.title}
                      </FxDropdownMenuItem>
                    ))
                  )}
                </FxDropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Work Date */}
          <div className="w-full">
            <FxLabel
              htmlFor="workdate"
              className="text-foreground mb-2 block text-[13px] font-medium"
            >
              Work date
            </FxLabel>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <FxButton
                  type="button"
                  id="workdate"
                  className="border-border bg-muted/50 text-foreground hover:bg-muted focus:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-1"
                >
                  <span>{formattedDate}</span>
                  <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
                </FxButton>
              </PopoverTrigger>
              <FxPopoverContent className="w-auto p-0" align="start">
                <FxCalendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date)
                    setIsCalendarOpen(false)
                  }}
                  variant="compact"
                />
              </FxPopoverContent>
            </Popover>
          </div>

          {/* Duration Input */}
          <DurationInput
            value={duration}
            onChange={setDuration}
            dailyCapacityHours={dailyCapacityHours}
            alreadyLoggedMinutes={alreadyLoggedMinutes}
            onErrorChange={setHasDurationError}
          />

          {/* Description */}
          <div className="w-full pt-1">
            <FxLabel
              htmlFor="description"
              className="text-foreground mb-2 block text-[13px] font-medium"
            >
              Description <span className="text-destructive">*</span>
            </FxLabel>
            <FxTextarea
              id="description"
              rows={4}
              variant="subtle"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='What did you work on? e.g. "M2 auth: RLS policies for memberships"'
              className="text-[13px]"
            />
            <p className="text-muted-foreground mt-1.5 text-[11.5px]">
              Required — &quot;development&quot; is not a receipt. Be specific
              so approvers and clients can read the work.
            </p>
          </div>
        </FxSheetBody>

        {/* Footer Actions */}
        <FxSheetFooter>
          <span className="text-muted-foreground text-[12px]">
            Saved as a{' '}
            <strong className="text-foreground font-semibold">Draft</strong> —
            submit for approval later.
          </span>

          <div className="flex items-center gap-2">
            <FxButton
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="text-foreground bg-muted border-border text-[12.5px]"
            >
              Cancel
            </FxButton>
            <FxButton
              variant="default"
              disabled={isSubmitDisabled}
              onClick={handleLogTime}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check width={14} height={14} />
              )}
              <span>Log time</span>
            </FxButton>
          </div>
        </FxSheetFooter>
      </FxSheetContent>
    </Sheet>
  )
}
