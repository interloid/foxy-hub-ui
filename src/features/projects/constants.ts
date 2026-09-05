// src/features/projects/constants.ts
import type { ProjectStatus } from './types'

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
