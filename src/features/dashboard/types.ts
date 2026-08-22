import { Database } from '@/types/supabase'

export type UserRole = Database['public']['Enums']['user_role']
export type DeliveryStatus = Database['public']['Enums']['delivery_status']
export type ProjectStatus = Database['public']['Enums']['project_status']
export type DeltaType = 'success' | 'warning' | 'info' | 'destructive'

export interface DashboardStat {
  label: string
  value: string
  delta: string
  deltaColor: string
  deltaType?: DeltaType
  iconType?: DeltaType
  icon: string
}

export interface PendingApproval {
  id: string
  name: string
  project: string
  client: string
  ext: string
  iconBg: string
  iconColor: string
  done: boolean
  pending: boolean
}

export interface ActiveProject {
  id: string
  name: string
  client: string
  status: ProjectStatus
  statusBg: string
  statusColor: string
  progress: string
  value: string
}

export interface ActivityEvent {
  id: string
  initials: string
  avatarBg: string
  avatarColor: string
  text: string
  time: string
}

export interface CapacityRow {
  id: string
  name: string
  initials: string
  avatarColor?: string
  pctLabel: string
  barPct: string
  barColor: string
  pctColor: string
  pctValue?: number
  isOverCapacity?: boolean
}

export interface StudioPlanInfo {
  name: string
  status: string
  usedSeats: number
  totalSeats: number
  renewsAt: string | null
}

export interface DashboardData {
  userName: string
  orgName: string
  role: UserRole
  stats: DashboardStat[]
  approvals: PendingApproval[]
  projects: ActiveProject[]
  activities: ActivityEvent[]
  capacities: CapacityRow[]
  capacityOverCount: number
  planInfo: StudioPlanInfo
}
