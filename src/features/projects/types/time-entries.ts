export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface TimeEntryItem {
  id: string
  workDate: string
  authorName: string
  authorInitials: string
  avatarColorClass?: string
  milestoneTitle?: string | null
  description: string
  durationMinutes: number
  status: TimeEntryStatus
}

export interface TimeEntriesTableCardProps {
  entries?: TimeEntryItem[] | null
  isError?: boolean
}
