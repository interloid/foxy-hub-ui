import { UserRole } from '../dashboard/types'

export type EntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface ApprovalsViewProps {
  approvals: UserPendingApprovals[]
  onApproveAll?: (userId: string) => void
  onApproveEntry?: (entryId: string) => void
  onRejectEntry?: (entryId: string) => void
  className?: string
}

export interface WeeklyTimeSummary {
  loggedThisWeekMinutes: number
  approvedMinutes: number
  pendingReviewMinutes: number
  draftMinutes: number
  pendingApprovalsCount?: number
}

export interface MyTimeCardProps {
  summary: WeeklyTimeSummary
  entries: WeeklyTimeEntryItem[]
  approvals: UserPendingApprovals[]
  capacities: UserCapacityItem[]
  standardHoursPerDay: number
  className?: string
}

export interface WeeklyTimeEntriesTableProps {
  entries: WeeklyTimeEntryItem[]
  onSubmitAllDrafts?: () => void
  onSubmitSingleDraft?: (entryId: string) => void
  className?: string
  isPending?: boolean
  submittingId?: string | 'all' | null
}

export interface TimeTrackingHeaderProps {
  userName?: string
  onLogTime?: () => void
}

export interface PendingApprovalEntry {
  id: string
  workDate: string
  projectName: string
  description: string
  durationMinutes: number
  status?: EntryStatus
}

export interface UserPendingApprovals {
  userId: string
  fullName: string
  avatarUrl: string | null
  totalEntriesCount: number
  totalAwaitingMinutes: number
  entries: PendingApprovalEntry[]
}

export interface WeeklyTimeEntryItem {
  id: string
  workDate: string
  projectName: string
  description: string
  durationMinutes: number
  status: EntryStatus
}

export interface ProjectAllocationItem {
  id: string
  projectId: string
  projectName: string
  hoursPerDay: number
}

export interface UserCapacityItem {
  userId: string
  fullName: string
  role: UserRole
  avatarUrl?: string | null
  allocations: ProjectAllocationItem[]
}

export interface CapacityViewProps {
  capacities: UserCapacityItem[]
  standardHoursPerDay?: number
  className?: string
}
