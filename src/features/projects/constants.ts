import type { EngagementModel, ProjectStatus } from './types'

export const NON_INVOICEABLE_STATUSES = new Set<ProjectStatus | string>([
  'draft',
  'cancelled',
  'completed',
])

export interface ProjectStatusStyle {
  label: string
  badgeClass: string
  dotClass: string
}

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, ProjectStatusStyle> =
  {
    'in-progress': {
      label: 'In Progress',
      badgeClass: 'bg-info/25 text-info',
      dotClass: 'bg-info',
    },
    'pending-approval': {
      label: 'Pending Approval',
      badgeClass: 'bg-warning/25 text-warning',
      dotClass: 'bg-warning',
    },
    pending: {
      label: 'Pending',
      badgeClass: 'bg-muted text-muted-foreground',
      dotClass: 'bg-muted-foreground',
    },
    'on-hold': {
      label: 'On Hold',
      badgeClass: 'bg-warning/25 text-warning',
      dotClass: 'bg-warning',
    },
    completed: {
      label: 'Completed',
      badgeClass: 'bg-success/25 text-success',
      dotClass: 'bg-success',
    },
    draft: {
      label: 'Draft',
      badgeClass: 'bg-muted text-muted-foreground',
      dotClass: 'bg-muted-foreground',
    },
    cancelled: {
      label: 'Cancelled',
      badgeClass: 'bg-destructive/25 text-destructive',
      dotClass: 'bg-destructive',
    },
  }

export const ENGAGEMENT_LABELS: Record<EngagementModel, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  fixed: 'Fixed Fee',
  retainer: 'Retainer',
}

export const ALL_PROJECT_STATUSES = Object.keys(
  PROJECT_STATUS_CONFIG
) as ProjectStatus[]

export const ALL_ENGAGEMENT_MODELS = Object.keys(
  ENGAGEMENT_LABELS
) as EngagementModel[]

/** Statuses considered "active" work — everything except closed-out projects. */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  'pending',
  'in-progress',
  'pending-approval',
  'on-hold',
  'draft',
]

/** No dedicated health model exists yet — "at risk" is proxied by on-hold status. */
export const AT_RISK_PROJECT_STATUSES: ProjectStatus[] = ['on-hold']

export const CLOSED_PROJECT_STATUSES: ProjectStatus[] = [
  'completed',
  'cancelled',
]

export type ProjectsTab =
  'all-active' | 'mine' | 'at-risk' | 'retainers' | 'closed'

export const PROJECT_TABS: { value: ProjectsTab; label: string }[] = [
  { value: 'all-active', label: 'All active' },
  { value: 'mine', label: 'Mine' },
  { value: 'at-risk', label: 'At risk' },
  { value: 'retainers', label: 'Retainers' },
  { value: 'closed', label: 'Closed' },
]

export interface ProjectTabCounts {
  allActive: number
  mine: number
  atRisk: number
  retainers: number
  closed: number
}

export const PAGE_SIZE_OPTIONS = [5, 10, 25] as const
export const DEFAULT_PAGE_SIZE = 10

export const TAB_COUNT_KEY: Record<ProjectsTab, keyof ProjectTabCounts> = {
  'all-active': 'allActive',
  mine: 'mine',
  'at-risk': 'atRisk',
  retainers: 'retainers',
  closed: 'closed',
}
