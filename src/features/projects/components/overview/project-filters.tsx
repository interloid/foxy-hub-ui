'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import {
  FxInputGroup,
  FxInputGroupAddon,
  FxInputGroupInput,
} from '@/components/shared/fx-input-group'
import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Tabs } from '@/components/ui/tabs'
import { NewProjectSheet } from '@/features/dashboard/components/sheets/new-project-sheet'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import type { ClientOption, TeamMemberOption } from '@/features/dashboard/types'
import {
  ALL_ENGAGEMENT_MODELS,
  ALL_PROJECT_STATUSES,
  ENGAGEMENT_LABELS,
  PROJECT_STATUS_CONFIG,
  PROJECT_TABS,
  TAB_COUNT_KEY,
  type ProjectTabCounts,
} from '@/features/projects/constants'
import { isAdminRole } from '@/lib/role'
import { cn } from '@/lib/utils'
import { Plus, Search, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ProjectFiltersProps {
  tabCounts: ProjectTabCounts
  clients: ClientOption[]
  teamMembers: TeamMemberOption[]
  isPending: boolean
  updateParams: (updates: Record<string, string | undefined>) => void
  page?: number
  pageSize?: number
  totalCount?: number
}

interface SelectOption {
  value: string
  label: string
}

interface ActiveFilterChip {
  key: string
  label: string
}

function FilterChip({
  chip,
  onRemove,
}: {
  chip: ActiveFilterChip
  onRemove: () => void
}) {
  return (
    <FxBadge className="outline-border gap-1 rounded-sm p-2.5 pr-1 font-medium whitespace-nowrap outline">
      {chip.label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${chip.label}`}
        className="cursor-pointer rounded-full p-0.5"
      >
        <X className="size-3.5" />
      </button>
    </FxBadge>
  )
}

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="border-border bg-card hover:bg-muted cursor-pointer rounded-full text-xs font-medium"
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="text-foreground">{selected?.label ?? 'All'}</span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        sideOffset={6}
        className="w-60 p-1"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="cursor-pointer p-2"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ProjectFilters({
  tabCounts,
  clients,
  teamMembers,
  isPending,
  updateParams,
  page = 1,
  pageSize = 10,
  totalCount = 0,
}: ProjectFiltersProps) {
  const searchParams = useSearchParams()
  const { userRole } = useWorkspace()
  const canCreateProject = isAdminRole(userRole)

  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)

  const tab = searchParams.get('tab') || 'all-active'
  const status = searchParams.get('status') || 'all'
  const engagement = searchParams.get('engagement') || 'all'
  const client = searchParams.get('client') || 'all'
  const team = searchParams.get('team') || 'all'
  const urlSearch = searchParams.get('q') ?? ''

  const [searchInput, setSearchInput] = useState(urlSearch)
  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch)

  if (urlSearch !== syncedUrlSearch) {
    setSyncedUrlSearch(urlSearch)
    setSearchInput(urlSearch)
  }

  // Debounce free-text search so we don't push a URL update per keystroke.
  useEffect(() => {
    if (searchInput === urlSearch) return

    const timeout = setTimeout(() => {
      updateParams({ q: searchInput || undefined })
    }, 400)

    return () => clearTimeout(timeout)
  }, [searchInput, urlSearch, updateParams])

  const statusOptions: SelectOption[] = [
    { value: 'all', label: 'All' },
    ...ALL_PROJECT_STATUSES.map((s) => ({
      value: s,
      label: PROJECT_STATUS_CONFIG[s].label,
    })),
  ]

  const engagementOptions: SelectOption[] = [
    { value: 'all', label: 'All' },
    ...ALL_ENGAGEMENT_MODELS.map((e) => ({
      value: e,
      label: ENGAGEMENT_LABELS[e],
    })),
  ]

  const clientOptions: SelectOption[] = [
    { value: 'all', label: 'All' },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ]

  const teamOptions: SelectOption[] = [
    { value: 'all', label: 'Anyone' },
    ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
  ]

  const activeFilters: ActiveFilterChip[] = []

  if (urlSearch) {
    activeFilters.push({ key: 'q', label: `Search: "${urlSearch}"` })
  }
  if (status !== 'all') {
    activeFilters.push({
      key: 'status',
      label: `Status: ${statusOptions.find((o) => o.value === status)?.label ?? status}`,
    })
  }
  if (client !== 'all') {
    activeFilters.push({
      key: 'client',
      label: `Client: ${clientOptions.find((o) => o.value === client)?.label ?? client}`,
    })
  }
  if (team !== 'all') {
    activeFilters.push({
      key: 'team',
      label: `Team: ${teamOptions.find((o) => o.value === team)?.label ?? team}`,
    })
  }
  if (engagement !== 'all') {
    activeFilters.push({
      key: 'engagement',
      label: `Engagement: ${engagementOptions.find((o) => o.value === engagement)?.label ?? engagement}`,
    })
  }

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalCount)

  const clearAll = () => {
    setSearchInput('')
    updateParams({
      q: undefined,
      status: undefined,
      client: undefined,
      team: undefined,
      engagement: undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:items-start md:justify-between lg:flex-row">
        <div className="space-y-1">
          <h1 className="text-foreground text-[22px]! font-medium tracking-tight">
            Projects
          </h1>
          <p className="text-muted-foreground text-sm">
            Every engagement, with hours burned read against work delivered.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
          <FxInputGroup className="bg-card h-10 max-w-70">
            <FxInputGroupAddon className="border-none">
              <Search className="text-muted-foreground size-4" />
            </FxInputGroupAddon>
            <FxInputGroupInput
              placeholder="Search projects..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}

              aria-label="Search projects"
            />
          </FxInputGroup>

          {canCreateProject && (
            <FxButton
              onClick={() => setIsNewProjectOpen(true)}
              className="shrink-0 gap-1.5"
            >
              <Plus className="size-4" />
              New project
            </FxButton>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          updateParams({ tab: value === 'all-active' ? undefined : value })
        }
      >
        <div className="w-full scrollbar-none overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <FxTabsListUnderline>
            {PROJECT_TABS.map((t) => (
              <FxTabsTriggerUnderline
                key={t.value}
                value={t.value}
                className="cursor-pointer"
              >
                {t.label}
                <FxBadge variant="secondary" size="count">
                  {tabCounts[TAB_COUNT_KEY[t.value]]}
                </FxBadge>
              </FxTabsTriggerUnderline>
            ))}
          </FxTabsListUnderline>
        </div>
      </Tabs>

      <div
        aria-busy={isPending}
        className={cn(
          'flex flex-wrap items-center gap-2 transition-opacity',
          isPending && 'opacity-60'
        )}
      >
        <FilterPill
          label="Status"
          value={status}
          options={statusOptions}
          onChange={(value) => updateParams({ status: value })}
        />
        <FilterPill
          label="Client"
          value={client}
          options={clientOptions}
          onChange={(value) => updateParams({ client: value })}
        />
        <FilterPill
          label="Team"
          value={team}
          options={teamOptions}
          onChange={(value) => updateParams({ team: value })}
        />
        <FilterPill
          label="Engagement"
          value={engagement}
          options={engagementOptions}
          onChange={(value) => updateParams({ engagement: value })}
        />

        {totalCount > 0 && (
          <span className="text-muted-foreground text-xs font-medium whitespace-nowrap sm:ml-auto">
            Showing {rangeStart}–{rangeEnd} of {totalCount}
          </span>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((chip) => (
            <FilterChip
              key={chip.key}
              chip={chip}
              onRemove={() => {
                if (chip.key === 'q') setSearchInput('')
                updateParams({ [chip.key]: undefined })
              }}
            />
          ))}
          <FxButton
            variant={'secondary'}
            type="button"
            onClick={clearAll}
            className="text-primary-accent h-fit w-fit border-none bg-transparent text-xs font-semibold hover:bg-transparent"
          >
            Clear all
          </FxButton>
        </div>
      )}

      {canCreateProject && (
        <NewProjectSheet
          open={isNewProjectOpen}
          onOpenChange={setIsNewProjectOpen}
        />
      )}
    </div>
  )
}
