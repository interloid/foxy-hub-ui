import type { UserRole } from '@/lib/role'

import type { PersonRow } from '../types'

/**
 * Who may edit whose details (name, job title, role). One rule for the edit sheet AND
 * `updateMemberAction`; the database enforces the same rule in
 * `update_membership_details`.
 *
 *   - primary admin → anyone
 *   - admin         → themselves, managers and contributors; not other admins or the
 *                     primary admin, so admins cannot rewrite each other
 *   - everyone else → nobody
 */
export function canEditRole(
  viewerRole: UserRole | string | null | undefined,
  targetRole: UserRole | string,
  isSelf: boolean
): boolean {
  if (viewerRole === 'primary_admin') return true
  if (viewerRole === 'admin') {
    return isSelf || targetRole === 'manager' || targetRole === 'contributor'
  }
  return false
}

export function canEditMember(
  viewerRole: UserRole | string | null | undefined,
  viewerId: string | null,
  member: Pick<PersonRow, 'userId' | 'role'>
): boolean {
  return canEditRole(viewerRole, member.role, member.userId === viewerId)
}
