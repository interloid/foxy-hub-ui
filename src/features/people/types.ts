import type { UserRole } from '@/lib/role'

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
  allocatedProjectCount: number
  /**
   * Projects this person opened — `projects.created_by`. Distinct from the allocation
   * count above: you can own a project you are not staffed on, and be staffed on plenty
   * you did not open.
   */
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
  /**
   * Where the contact stands with their portal login, derived from `invitations` on
   * their email.
   *
   *   'none'     nobody has invited them — the New client checkbox was left off
   *   'pending'  invited, link still live, not yet redeemed
   *   'accepted' they signed up and hold a client membership
   *
   * Needed because inviting was only possible AT creation time. Without the state the
   * edit sheet could not tell "invite" from "resend" from "already in".
   */
  inviteStatus: 'none' | 'pending' | 'accepted'
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
