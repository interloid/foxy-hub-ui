import type { UserRole } from '@/lib/role'

import type { PersonRow } from '../types'

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
