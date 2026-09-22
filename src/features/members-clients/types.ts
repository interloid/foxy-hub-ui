import type { UserRole } from '@/lib/role'

/**
 * Derived from the generated enum rather than hand-listed, so a role added in
 * the database cannot silently miss this file — which is what would leave
 * `ROLE_BADGE` below without a key for it.
 */
export type WorkspaceRole = UserRole

export interface PersonRow {
  membershipId: string
  userId: string
  fullName: string
  email: string | null
  role: WorkspaceRole
  isActive: boolean
  lastActiveLabel: string
  subtitle: string
}

export interface ClientCompanyRow {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  projectCount: number
  isActive: boolean
}

export interface MembersClientsMetrics {
  seatsUsed: number
  seatsTotal: number | null
  planName: string
  pendingInvites: number
  activeClients: number
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
