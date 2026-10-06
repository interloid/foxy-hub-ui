'use client'

import { Activity, Search } from 'lucide-react'
import { useState } from 'react'

import { FxAvatar, FxAvatarFallback } from '@/components/shared/fx-avatar'
import { FxButton } from '@/components/shared/fx-button'
import {
  FxInputGroup,
  FxInputGroupAddon,
  FxInputGroupInput,
} from '@/components/shared/fx-input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatter } from '@/context/locale-provider'
import { initialsOf } from '@/lib/initials'
import { cn } from '@/lib/utils'

import { ACTIVITY_CATEGORIES, type ActivityCategory } from '../lib/categories'
import { relativeTime } from '../lib/relative-time'
import type { WorkspaceActivityItem } from '../queries/get-workspace-activity'
import { ActivityChangeChip } from './activity-change-chip'

type Range = 'all' | 'today' | '7d' | '30d' | '90d'

const RANGES: { id: Range; label: string; days: number | null }[] = [
  { id: 'all', label: 'All time', days: null },
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
]

const ANYONE = 'anyone'
const SYSTEM = 'system'

const CATEGORY_TAG: Record<ActivityCategory, string> = {
  projects: 'border-primary/40 text-primary',
  time: 'border-info/50 text-info',
  invoices: 'border-success/50 text-success',
  access: 'border-warning/50 text-warning',
  workspace: 'border-border text-muted-foreground',
  billing: 'border-destructive/40 text-destructive',
}

const ACTOR_AVATAR: Record<WorkspaceActivityItem['actorKind'], string> = {
  member: 'bg-primary',
  client: 'bg-info',
  system: 'bg-muted-foreground',
}

/** Midnight `days` days ago, in the browser's zone; null for All time. */
function rangeStart(range: Range): number | null {
  const days = RANGES.find((r) => r.id === range)?.days
  if (days === null || days === undefined) return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  return start.getTime()
}

export function WorkspaceActivityView({
  activities,
}: {
  activities: WorkspaceActivityItem[]
}) {
  const fmt = useFormatter()
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<Range>('all')
  const [category, setCategory] = useState<ActivityCategory | null>(null)
  const [actor, setActor] = useState(ANYONE)

  // Everyone who appears in the window, for the Anyone filter.
  const actors = [
    ...new Map(
      activities.flatMap((a) =>
        a.actorId ? [[a.actorId, a.actorName] as const] : []
      )
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))
  const hasSystem = activities.some((a) => !a.actorId)

  const query = search.trim().toLowerCase()
  const since = rangeStart(range)

  const rows = activities.filter((a) => {
    if (category && a.category !== category) return false
    if (
      actor === SYSTEM
        ? a.actorId !== null
        : actor !== ANYONE && a.actorId !== actor
    ) {
      return false
    }
    if (since !== null && new Date(a.createdAt).getTime() < since) return false
    if (!query) return true
    // "Person, record, field or value": the sentence, who did it, and every chip.
    return [
      a.summary,
      a.actorName,
      a.note ?? '',
      ...a.changes.flatMap((c) => [c.label, c.from ?? '', c.to]),
    ].some((text) => text.toLowerCase().includes(query))
  })

  const filtered =
    query !== '' || range !== 'all' || category !== null || actor !== ANYONE

  const clearFilters = () => {
    setSearch('')
    setRange('all')
    setCategory(null)
    setActor(ANYONE)
  }

  const pill = (active: boolean) =>
    cn(
      'border-border bg-card text-foreground hover:bg-muted cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
      active &&
        'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
    )

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Activity
        </h1>
        <p className="text-muted-foreground text-[13px]">
          The workspace audit trail - who changed what, and when. Entries are
          never edited or deleted; a correction is a new entry.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FxInputGroup className="bg-card h-10 sm:max-w-sm">
          <FxInputGroupAddon className="border-none">
            <Search className="text-muted-foreground size-4" />
          </FxInputGroupAddon>
          <FxInputGroupInput
            placeholder="Search person, record, field or value"
            aria-label="Search activity"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </FxInputGroup>

        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger
            aria-label="Time range"
            className="bg-card h-10! w-full cursor-pointer text-[13px] sm:w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            sideOffset={6}
            className="p-1"
          >
            {RANGES.map((r) => (
              <SelectItem
                key={r.id}
                value={r.id}
                className="cursor-pointer p-2 text-[13px]"
              >
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FxButton
          type="button"
          variant="outline"
          className="bg-card h-10"
          disabled={!filtered}
          onClick={clearFilters}
        >
          Clear filters
        </FxButton>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Activity category"
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={category === null}
            className={pill(category === null)}
            onClick={() => setCategory(null)}
          >
            Everything
          </button>
          {ACTIVITY_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              className={pill(category === c.id)}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger
              aria-label="Person"
              className="bg-card h-9! w-full cursor-pointer text-[13px] lg:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="end"
              sideOffset={6}
              className="p-1"
            >
              <SelectItem
                value={ANYONE}
                className="cursor-pointer p-2 text-[13px]"
              >
                Anyone
              </SelectItem>
              {actors.map(([id, name]) => (
                <SelectItem
                  key={id}
                  value={id}
                  className="cursor-pointer p-2 text-[13px]"
                >
                  {name}
                </SelectItem>
              ))}
              {hasSystem && (
                <SelectItem
                  value={SYSTEM}
                  className="cursor-pointer p-2 text-[13px]"
                >
                  System
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p
            className="text-muted-foreground shrink-0 text-xs"
            aria-live="polite"
          >
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
      </div>

      <section
        aria-label="Activity entries"
        className="bg-card border-border overflow-hidden rounded-xl border shadow-xs"
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
            <div className="bg-muted text-muted-foreground mb-2.5 flex h-10 w-10 items-center justify-center rounded-full">
              <Activity className="size-5" />
            </div>
            <p className="text-foreground text-[13.5px] font-medium">
              {filtered ? 'Nothing matches these filters' : 'No activity yet'}
            </p>
            <p className="text-muted-foreground mt-0.5 text-[12px]">
              {filtered
                ? 'Try a wider time range or clear the filters.'
                : 'Changes across projects, time, invoices and the team will appear here.'}
            </p>
          </div>
        ) : (
          <ul className="divide-border/60 divide-y">
            {rows.map((item) => {
              const label = ACTIVITY_CATEGORIES.find(
                (c) => c.id === item.category
              )?.label
              return (
                <li key={item.id} className="flex items-start gap-3 px-5 py-4">
                  {item.actorKind === 'system' ? (
                    <span
                      aria-hidden="true"
                      className="bg-muted flex size-7.5 shrink-0 items-center justify-center rounded-full"
                    >
                      <span className="bg-muted-foreground/40 size-2 rounded-full" />
                    </span>
                  ) : (
                    <FxAvatar className="shrink-0">
                      <FxAvatarFallback
                        className={cn(
                          'text-[11px]',
                          ACTOR_AVATAR[item.actorKind]
                        )}
                      >
                        {initialsOf(item.actorName, null)}
                      </FxAvatarFallback>
                    </FxAvatar>
                  )}

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <p className="text-foreground text-[13px] leading-snug">
                        {item.summary}{' '}
                        <span
                          className={cn(
                            'ml-1 inline-flex rounded-full border px-2 py-px align-middle text-[11px] font-medium',
                            CATEGORY_TAG[item.category]
                          )}
                        >
                          {label}
                        </span>
                      </p>
                      <time
                        dateTime={item.createdAt}
                        title={fmt.date(item.createdAt, 'dateTime')}
                        suppressHydrationWarning
                        className="text-subtle-foreground shrink-0 text-[11.5px] whitespace-nowrap"
                      >
                        {relativeTime(item.createdAt, fmt)}
                      </time>
                    </div>

                    {item.changes.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {item.changes.map((change, i) => (
                          <ActivityChangeChip key={i} change={change} />
                        ))}
                      </div>
                    )}

                    {item.note && (
                      <p className="text-muted-foreground text-[12.5px] break-words">
                        &ldquo;{item.note}&rdquo;
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
