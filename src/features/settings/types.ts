export interface WorkspaceSettings {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  dailyCapacityHours: number
  daysPerWeek: number
  currency: string
  roundingMinutes: number
  canEdit: boolean
  seatsUsed: number
  seatsTotal: number | null
  pendingInvites: number
}
