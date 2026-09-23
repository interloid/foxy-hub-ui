import type { PersonRow } from '../types'

/**
 * You never deactivate your own seat, and the primary admin's seat is the one that
 * cannot be emptied — hand the role over first. Shared by the member row and the edit
 * sheet so the two Deactivate buttons never disagree.
 */
export function canDeactivateMember(
  canManage: boolean,
  viewerId: string | null,
  member: Pick<PersonRow, 'userId' | 'role' | 'isActive'>
): boolean {
  return (
    canManage &&
    member.isActive &&
    member.role !== 'primary_admin' &&
    member.userId !== viewerId
  )
}
