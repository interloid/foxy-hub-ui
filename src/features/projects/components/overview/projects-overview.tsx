'use client'

import type { ClientOption, TeamMemberOption } from '@/features/dashboard/types'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useTransition } from 'react'
import { DEFAULT_PAGE_SIZE, type ProjectTabCounts } from '../../constants'
import type { Project, ProjectMetrics } from '../../types'
import { ProjectFilters } from './project-filters'
import { ProjectTable } from './project-table'

interface ProjectsOverviewProps {
  initialProjects: Project[]
  metrics: ProjectMetrics
  tabCounts: ProjectTabCounts
  clients: ClientOption[]
  teamMembers: TeamMemberOption[]
  orgSlug: string
  page?: number
  totalPages?: number
  totalCount?: number
  pageSize?: number
}

export function ProjectsOverview({
  initialProjects,
  tabCounts,
  clients,
  teamMembers,
  orgSlug,
  page = 1,
  totalCount,
  totalPages = 1,
  pageSize,
}: ProjectsOverviewProps) {
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
        router.push(`${pathname}${query ? `?${query}` : ''}`, {
          scroll: false,
        })
      })
    },
    [pathname, router]
  )

  const handlePageChange = useCallback(
    (newPage: number) => {
      updateParams({ page: newPage > 1 ? String(newPage) : undefined }, false)
    },
    [updateParams]
  )

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      updateParams({
        pageSize: newSize === DEFAULT_PAGE_SIZE ? undefined : String(newSize),
      })
    },
    [updateParams]
  )

  return (
    <main className="ds:p-6 w-full p-4">
      <div className="flex w-full flex-col gap-5">
        <ProjectFilters
          tabCounts={tabCounts}
          clients={clients}
          teamMembers={teamMembers}
          isPending={isPending}
          updateParams={updateParams}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
        />

        <ProjectTable
          initialProjects={initialProjects}
          orgSlug={orgSlug}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          isPending={isPending}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </main>
  )
}
