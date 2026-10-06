'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { FxLabel } from '@/components/shared/fx-field'
import {
  FxPopoverContent,
  Popover,
  PopoverTrigger,
} from '@/components/shared/fx-menu'
import { FxTextarea } from '@/components/shared/fx-textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useFormatter } from '@/context/locale-provider'
import { fromISODate } from '@/lib/working-days'
import { toISODate } from '@/lib/date'
import { parseDurationToMinutes } from '@/lib/duration'
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createTimeEntry } from '@/features/dashboard/actions'
import { getDayCapacity, type DayCapacity } from '../../action'
import { DurationInput } from './duration-input'
import { LogTimeTimer } from './log-time-timer'
import { LogAgainCard, ProjectProgressCard, ThisWeekCard } from './side-cards'
import type { LogTimePageData, LogTimeRecentEntry } from './types'

// Radix Select can't use an empty value, so "General" (no milestone) gets a sentinel.
const NO_MILESTONE = 'general'

const labelClass =
  'text-muted-foreground mb-1.5 block text-[13px] leading-normal font-medium'
const selectTriggerClass = 'bg-muted h-10! w-full cursor-pointer text-[13px]'

interface LogTimeViewProps {
  orgSlug: string
  data: LogTimePageData
}

export function LogTimeView({ orgSlug, data }: LogTimeViewProps) {
  const fmt = useFormatter()
  const router = useRouter()
  const timeHref = `/${orgSlug}/time`

  // Start on the project of your latest entry - usually what you're still working on.
  const [projectId, setProjectId] = useState(
    data.recent[0]?.projectId ?? data.projects[0]?.id ?? ''
  )
  const [milestoneId, setMilestoneId] = useState(NO_MILESTONE)
  const [workDate, setWorkDate] = useState<Date>(() => fromISODate(data.today))
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [duration, setDuration] = useState('')
  const [hasDurationError, setHasDurationError] = useState(false)
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(true)
  const [isSaving, startSaving] = useTransition()
  // Capacity per work date, fetched once per date. The save re-checks it on the server.
  const [capacityByDate, setCapacityByDate] = useState<
    Record<string, DayCapacity>
  >({})

  const project = data.projects.find((p) => p.id === projectId)
  const workDateStr = toISODate(workDate)
  const capacity = capacityByDate[workDateStr]

  useEffect(() => {
    if (capacityByDate[workDateStr]) return
    let cancelled = false
    getDayCapacity(orgSlug, workDateStr).then((result) => {
      if (!cancelled && result) {
        setCapacityByDate((prev) => ({ ...prev, [workDateStr]: result }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [capacityByDate, orgSlug, workDateStr])

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    // Milestones belong to a project, so a new project starts on General.
    setMilestoneId(NO_MILESTONE)
  }

  const handleLogAgain = (entry: LogTimeRecentEntry) => {
    setProjectId(entry.projectId)
    setMilestoneId(entry.milestoneId ?? NO_MILESTONE)
    setDescription(entry.description)
  }

  const canSubmit =
    !isSaving &&
    Boolean(project) &&
    parseDurationToMinutes(duration) !== null &&
    !hasDurationError &&
    description.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit || !project) return

    startSaving(async () => {
      const res = await createTimeEntry({
        orgSlug,
        projectId: project.id,
        milestoneId: milestoneId === NO_MILESTONE ? null : milestoneId,
        workDate: workDateStr,
        durationStr: duration,
        description: description.trim(),
        billable,
      })

      if (!res.ok) {
        toast.error(res.error || 'Failed to log time. Please try again.')
        return
      }
      toast.success('Time logged as a draft')
      router.push(timeHref)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={timeHref}
            className="text-muted-foreground hover:text-foreground duration-fast inline-flex items-center gap-1.5 text-[13px] transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Time
          </Link>
          <span className="text-muted-foreground/60 text-[13px]">/</span>
          <h1 className="text-foreground text-[22px]! font-medium tracking-tight">
            Log time
          </h1>
        </div>
        <p className="text-muted-foreground text-[13px]">
          Log it the day it happens - time reconstructed on Friday under-counts
          billable hours by 5-15%.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[6fr_4fr]">
        <FxCard className="rounded-xl">
          <FxCardContent className="flex flex-col gap-5 p-5">
            <LogTimeTimer
              scope={orgSlug}
              onUse={(minutes) => setDuration(`${minutes}m`)}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FxLabel
                  htmlFor="project"
                  className={`${labelClass} required-star`}
                >
                  Project
                </FxLabel>
                <Select value={projectId} onValueChange={handleProjectChange}>
                  <SelectTrigger id="project" className={selectTriggerClass}>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    sideOffset={6}
                    className="p-1"
                  >
                    {data.projects.length === 0 && (
                      <p className="text-muted-foreground p-2 text-[13px]">
                        You aren&apos;t on any projects yet
                      </p>
                    )}
                    {data.projects.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        className="cursor-pointer p-2 text-[13px]"
                      >
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FxLabel htmlFor="milestone" className={labelClass}>
                  Milestone
                </FxLabel>
                <Select
                  value={milestoneId}
                  onValueChange={setMilestoneId}
                  disabled={!project}
                >
                  <SelectTrigger id="milestone" className={selectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    sideOffset={6}
                    className="p-1"
                  >
                    <SelectItem
                      value={NO_MILESTONE}
                      className="cursor-pointer p-2 text-[13px]"
                    >
                      General
                    </SelectItem>
                    {project?.milestones.map((m) => (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        className="cursor-pointer p-2 text-[13px]"
                      >
                        {m.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <FxLabel htmlFor="workDate" className={labelClass}>
                Work date
              </FxLabel>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <FxButton
                    id="workDate"
                    type="button"
                    className="border-border bg-muted text-foreground hover:bg-muted flex h-10 w-full items-center justify-between rounded-md border px-3 text-[13px] font-normal"
                  >
                    <span>{fmt.date(workDateStr, 'numeric')}</span>
                    <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
                  </FxButton>
                </PopoverTrigger>
                <FxPopoverContent className="w-auto p-0" align="start">
                  <FxCalendar
                    mode="single"
                    selected={workDate}
                    onSelect={(date) => {
                      if (date) setWorkDate(date)
                      setIsCalendarOpen(false)
                    }}
                    variant="compact"
                  />
                </FxPopoverContent>
              </Popover>
            </div>

            <DurationInput
              value={duration}
              onChange={setDuration}
              dailyCapacityHours={capacity?.dailyCapacityHours ?? 8}
              alreadyLoggedMinutes={capacity?.alreadyLoggedMinutes ?? 0}
              onErrorChange={setHasDurationError}
            />

            <div>
              <FxLabel
                htmlFor="description"
                className={`${labelClass} required-star`}
              >
                Description
              </FxLabel>
              <FxTextarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='What did you work on? e.g. "M2 auth: RLS policies for memberships"'
                className="bg-muted min-h-24 text-[13px]"
                maxLength={500}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                Required - &quot;development&quot; is not a receipt. Be specific
                so approvers and clients can read the work.
              </p>
            </div>

            <label
              htmlFor="billable"
              className="border-border bg-muted/60 flex cursor-pointer items-start gap-3 rounded-xl border p-4"
            >
              <Switch
                id="billable"
                checked={billable}
                onCheckedChange={setBillable}
                className="mt-0.5"
              />
              <span>
                <span className="text-foreground block text-[13px] font-semibold">
                  Billable
                </span>
                <span className="text-muted-foreground block text-xs">
                  Feeds the retainer burn and can be invoiced once approved.
                </span>
              </span>
            </label>

            <div className="border-border flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                Saved as a{' '}
                <strong className="text-foreground font-semibold">Draft</strong>{' '}
                - submit for approval from Time.
              </p>
              <div className="flex items-center gap-2">
                <FxButton
                  type="button"
                  variant="secondary"
                  disabled={isSaving}
                  onClick={() => router.push(timeHref)}
                >
                  Cancel
                </FxButton>
                <FxButton
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="gap-1.5"
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {isSaving ? 'Saving...' : 'Log time'}
                </FxButton>
              </div>
            </div>
          </FxCardContent>
        </FxCard>

        <div className="flex flex-col gap-4">
          <ThisWeekCard week={data.week} totalMinutes={data.weekTotalMinutes} />
          <ProjectProgressCard
            project={project}
            seesAllHours={data.seesAllHours}
          />
          <LogAgainCard entries={data.recent} onPick={handleLogAgain} />
        </div>
      </div>
    </div>
  )
}
