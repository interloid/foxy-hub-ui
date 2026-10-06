export type MilestoneStatus = 'pending' | 'in_progress' | 'completed'
export type MilestoneCounts = { completed: number; total: number }

export interface UpdateMilestoneParams {
  milestoneId: string
  projectId: string
  title: string
  dueDate: string
  status: MilestoneStatus
}

export interface MilestoneItem {
  id: string
  projectId: string
  title: string
  dueDate?: string | null
  status: MilestoneStatus
  loggedMinutes?: number
}

export interface CreateMilestoneInput {
  projectId: string
  orgId: string
  title: string
  dueDate: string
  orgSlug: string
  status?: MilestoneStatus
}
