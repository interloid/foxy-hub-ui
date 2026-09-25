import type { UserRole } from '@/lib/role'

import type { PersonRow } from '../types'

/**
 * Who may deactivate whom (RISK-005). One rule for the button, the edit sheet AND
 * `deactivateMembershipAction` — they used to disagree, so admins saw a button the server
 * always refused. The database enforces the same rule in `guard_membership_update`.
 *
 *   - primary admin → anyone except the primary admin (i.e. themselves)
 *   - admin         → managers and contributors only; not other admins, so admins
 *                     cannot lock each other out
 *   - everyone else → nobody
 */
export function canDeactivateRole(
  viewerRole: UserRole | string | null | undefined,
  targetRole: UserRole | string
): boolean {
  if (viewerRole === 'primary_admin') return targetRole !== 'primary_admin'
  if (viewerRole === 'admin') {
    return targetRole === 'manager' || targetRole === 'contributor'
  }
  return false
}

/** The UI check: the role rule, plus "still active" and "not yourself". */
export function canDeactivateMember(
  viewerRole: UserRole | string | null | undefined,
  viewerId: string | null,
  member: Pick<PersonRow, 'userId' | 'role' | 'isActive'>
): boolean {
  return (
    member.isActive &&
    member.userId !== viewerId &&
    canDeactivateRole(viewerRole, member.role)
  )
}

/**
 * Reactivating follows the same role rule as deactivating (RISK-022), for someone who is
 * currently deactivated. The seat limit is checked by the database, not here.
 */
export function canReactivateMember(
  viewerRole: UserRole | string | null | undefined,
  viewerId: string | null,
  member: Pick<PersonRow, 'userId' | 'role' | 'isActive'>
): boolean {
  return (
    !member.isActive &&
    member.userId !== viewerId &&
    canDeactivateRole(viewerRole, member.role)
  )
}
