export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'client'

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
