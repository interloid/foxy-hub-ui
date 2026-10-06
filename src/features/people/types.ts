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
  avatarUrl: string | null
  /** `memberships.default_rate` - the bill rate. Null unless the viewer is an admin. */
  defaultRate: number | null
  /** `memberships.cost_rate` - what this person is paid. Null unless the viewer is the
   * primary admin; it never reaches anyone else's browser. */
  costRate: number | null
}

export interface ClientCompanyRow {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  projectCount: number
  isActive: boolean
  hasPortal: boolean
  /** The profile photo of the contact's portal login, when they have one. */
  avatarUrl: string | null
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
