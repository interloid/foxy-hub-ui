export interface NewProjectClient {
  id: string
  name: string
  /** `clients.contact_name` - the only client-side person we know of, offered for sign-off. */
  contactName: string | null
}

import type { UserRole } from '@/lib/role'

export interface NewProjectMember {
  id: string
  name: string
  role: UserRole
  /** Display label for the role, e.g. "Admin". */
  roleLabel: string
  /** `memberships.default_rate` - seeds an allocation's bill rate. Null until someone sets it. */
  defaultRate: number | null
  /** `memberships.cost_rate` - shown for margin only; the RPC snapshots the real value.
   * Always null unless the viewer is the primary admin. */
  costRate: number | null
}

export interface NewProjectFormData {
  clients: NewProjectClient[]
  /** Active staff. The team picker lists all of them; the owner picker only
   * `PROJECT_OWNER_ROLES`. */
  members: NewProjectMember[]
  currentUserId: string
  /** Cost rate is the primary admin's alone - everyone else never receives it. */
  canSeeCost: boolean
  dailyCapacityHours: number
  daysPerWeek: number
  roundingMinutes: number
}
