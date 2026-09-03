export type ProjectStatus =
  | 'pending'
  | 'in-progress'
  | 'pending-approval'
  | 'on-hold'
  | 'completed'
  | 'draft'
  | 'cancelled'

export type EngagementModel = 'full_time' | 'part_time' | 'fixed' | 'retainer'

export type RetainerPeriod = 'weekly' | 'monthly' | 'quarterly' | 'annually'

export interface ProjectMember {
  id: string
  name: string
  avatarUrl?: string
  role: string
}

export interface Project {
  id: string
  orgId: string
  name: string
  code: string
  clientId?: string | null
  clientName: string
  description?: string | null
  status: ProjectStatus
  startDate?: string | null
  startFrom?: string | null
  dueDate?: string | null
  engagement: EngagementModel
  contractValue?: number | null
  retainerHours?: number | null
  retainerPeriod?: RetainerPeriod | null
  retainerAmount?: number | null
  retainerOverage?: number | null
  overrideReason?: string | null
  createdAt: string
  updatedAt: string
  progressPercent: number
  members: ProjectMember[]
}

export interface ProjectMetrics {
  totalProjects: number
  activeProjects: number
  delayedProjects: number
  completedThisMonth: number
}

export interface ProjectUpdate {
  id: string
  projectId: string
  authorId: string
  authorName: string
  authorInitials: string
  avatarColorClass?: string
  body: string
  createdAt: string
}
