import type { UserRole } from '@/lib/role'

export type WorkspaceRole = UserRole

export interface PersonRow {
  membershipId: string
  userId: string
  /** What to SHOW — the profile name, or "Unnamed teammate". Never send it back. */
  fullName: string
  /** The profile name as stored, or null — what the edit form edits (RISK-006). */
  savedName: string | null
  email: string | null
  role: WorkspaceRole
  isActive: boolean
  lastActiveLabel: string
  subtitle: string
  allocatedProjectCount: number
  ownedProjectCount: number
  jobTitle: string | null
}

export interface ClientCompanyRow {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  projectCount: number
  isActive: boolean
  hasPortal: boolean
}

export interface MembersClientsMetrics {
  seatsUsed: number
  seatsTotal: number | null
  planName: string
  pendingInvites: number
  activeClients: number

  clientsWithPortal: number
}

export interface ProjectOption {
  id: string
  name: string
}

export interface MembersClientsData {
  metrics: MembersClientsMetrics
  members: PersonRow[]
  clients: ClientCompanyRow[]
  projectOptions: ProjectOption[]
  viewerRole: WorkspaceRole | null
}
