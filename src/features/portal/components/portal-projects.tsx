'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { Search, X } from 'lucide-react'

import { FxBadge } from '@/components/shared/fx-badge'
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
} from '@/components/ui/select'
import { ProjectTable } from '@/features/projects/components/overview/project-table'
import {
  ALL_ENGAGEMENT_MODELS,
  ALL_PROJECT_STATUSES,
  ENGAGEMENT_LABELS,
  PROJECT_STATUS_CONFIG,
} from '@/features/projects/constants'
import type { Project } from '@/features/projects/types'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

interface ActiveFilterChip {
  key: string
  label: string
}

/** The staff bar's chip, same shape — one filter, with its own remove button. */
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
  options: Option[]
  onChange: (value: string) => void
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="bg-card h-9! w-auto cursor-pointer gap-1.5 rounded-full px-3 text-[13px]"
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

export function PortalProjects({
  projects,
  orgSlug,
  page = 1,
  totalPages = 1,
  totalCount = 0,
  pageSize = 10,
}: {
  projects: Project[]
  orgSlug: string
  page?: number
  totalPages?: number
  totalCount?: number
  pageSize?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParamsRef.current.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === 'all') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })

      if (resetPage) params.delete('page')

      startTransition(() => {
        const query = params.toString()
        router.push(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        })
      })
    },
    [pathname, router]
  )

  const status = searchParams.get('status') || 'all'
  const engagement = searchParams.get('engagement') || 'all'
  const urlSearch = searchParams.get('q') ?? ''

  const [searchInput, setSearchInput] = useState(urlSearch)
  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch)

  // Someone clearing the query from the URL has to win over what is in the box.
  if (urlSearch !== syncedUrlSearch) {
    setSyncedUrlSearch(urlSearch)
    setSearchInput(urlSearch)
  }

  useEffect(() => {
    if (searchInput === urlSearch) return

    const timeout = setTimeout(() => {
      updateParams({ q: searchInput || undefined })
    }, 400)

    return () => clearTimeout(timeout)
  }, [searchInput, urlSearch, updateParams])

  const statusOptions: Option[] = [
    { value: 'all', label: 'All' },
    ...ALL_PROJECT_STATUSES.map((s) => ({
      value: s,
      label: PROJECT_STATUS_CONFIG[s].label,
    })),
  ]

  const engagementOptions: Option[] = [
    { value: 'all', label: 'All' },
    ...ALL_ENGAGEMENT_MODELS.map((e) => ({
      value: e,
      label: ENGAGEMENT_LABELS[e],
    })),
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
  if (engagement !== 'all') {
    activeFilters.push({
      key: 'engagement',
      label: `Engagement: ${engagementOptions.find((o) => o.value === engagement)?.label ?? engagement}`,
    })
  }

  const clearAll = () => {
    setSearchInput('')
    updateParams({ q: undefined, status: undefined, engagement: undefined })
  }

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalCount)

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
      </div>

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
                // The search box holds its own draft, so clearing the chip has to clear
                // that too or the debounce would put the query straight back.
                if (chip.key === 'q') setSearchInput('')
                updateParams({ [chip.key]: undefined })
              }}
            />
          ))}
          <FxButton
            variant="secondary"
            type="button"
            onClick={clearAll}
            className="text-primary-accent h-fit w-fit border-none bg-transparent text-xs font-semibold hover:bg-transparent"
          >
            Clear all
          </FxButton>
        </div>
      )}

      {/*
        `basePath` rather than `orgSlug`: left to itself the table links rows at
        `/{org}/projects/{id}`, a staff route that would bounce the client back out.
      */}
      <ProjectTable
        initialProjects={projects}
        basePath={`/portal/${orgSlug}/projects`}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        isPending={isPending}
        onPageChange={(next) => updateParams({ page: String(next) }, false)}
        onPageSizeChange={(size) => updateParams({ pageSize: String(size) })}
      />
    </div>
  )
}
