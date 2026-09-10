export type ProjectStatus =
  | 'pending'
  | 'in-progress'
  | 'pending-approval'
  | 'on-hold'
  | 'completed'
  | 'draft'
  | 'cancelled'

export type EngagementModel = 'full_time' | 'part_time' | 'fixed' | 'retainer'

export type RetainerPeriod = 'weekly' | 'monthly'

export type DeliveryStatus = 'pending' | 'submitted' | 'approved' | 'rejected'

export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed'
export type MilestoneCounts = { completed: number; total: number }

export interface CurrentUser {
  email: string | undefined
  id: string
  full_name: string | null
  avatar_url: string | null
}
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
  clientId?: string | null
  clientName: string
  description?: string | null
  status: ProjectStatus
  startDate?: string | null
  startFrom?: string | null
  dueDate?: string | null
  engagement: EngagementModel
  milestones?: MilestoneCounts
  contractValue?: number | null
  retainerHours?: number | null
  retainerPeriod?: RetainerPeriod | null
  retainerAmount?: number | null
  retainerOverage?: number | null
  overrideReason?: string | null
  createdAt: string
  updatedAt: string
  progressPercent: number
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

export interface DeliveryAsset {
  id: string
  filePath: string
}

export interface DeliverableItem {
  id: string
  projectId: string
  orgId: string
  milestoneId?: string | null
  title: string
  description?: string | null
  status: DeliveryStatus
  approvedAt?: string | null
  dueDate?: string | null
  createdAt: string
  authorName: string
  fileSize: string
  fileType: string
  assets?: DeliveryAsset[]
}
export interface MilestoneItem {
  id: string
  projectId: string
  title: string
  dueDate?: string | null
  status: MilestoneStatus
  loggedMinutes?: number
}
export interface ProjectAllocationItem {
  id: string
  projectId: string
  userId: string
  userName: string
  userAvatarUrl?: string | null
  hoursPerDay: number
  daysPerWeek: number
  rate?: number | null
  effectiveFrom: string
  effectiveTo?: string | null
}

export interface TimeEntry {
  id: string
  userId: string
  projectId: string
  milestoneId?: string | null
  workDate: string
  durationMinutes: number
  description: string
  status: TimeEntryStatus
  createdAt: string
}

export interface ClientItem {
  id: string
  orgId: string
  name: string
  contactName?: string | null
  contactEmail?: string | null
}

export interface HoursSummaryData {
  /** Total duration in minutes logged for all entries from start of month to today */
  loggedMinutes: number
  /** Total duration in minutes for entries with status === 'approved' */
  approvedMinutes: number
  /** Total duration in minutes for entries with status === 'submitted' */
  pendingMinutes: number
}

export interface ProjectDelivery {
  id: string
  title: string
  description?: string | null
  status: 'pending' | 'approved' | 'rejected' | 'submitted'
  dueDate?: string | null
  createdAt: string
  orgId: string
  projectId: string
  approvedAt?: string | null
  milestoneTitle?: string | null
  assets?: DeliveryAsset[]
}

export interface CreateDeliveryInput {
  projectId: string
  orgId: string
  title: string
  description?: string
  milestoneId?: string
  dueDate: string
}

export interface ProjectMilestone {
  id: string
  title: string
  dueDate?: string | null
}

export interface CreateDeliverySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  orgId: string
  milestones: ProjectMilestone[]
  onSuccess?: () => void
}

export interface CreateMilestoneInput {
  projectId: string
  orgId: string
  title: string
  dueDate: string
  status?: MilestoneStatus
}

export interface GetProjectsParams {
  orgSlug: string
  page?: number
  pageSize?: number
}

export interface GetProjectsResult {
  projects: Project[]
  metrics: ProjectMetrics
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}
