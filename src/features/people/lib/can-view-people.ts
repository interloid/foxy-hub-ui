import type { UserRole } from '@/lib/role'

/**
 * Who may open People (/[org]/people): the same roles that see it in the sidebar
 * (config/nav.ts). Contributors do not — the page lists every member's email and last
 * sign-in (read with the service role, so no database rule protects it) and the client
 * contact list. Clients never reach [org] pages at all.
 */
const PEOPLE_VIEWER_ROLES: readonly UserRole[] = [
  'primary_admin',
  'admin',
  'manager',
]

export function canViewPeople(
  role: UserRole | string | null | undefined
): boolean {
  return Boolean(
    role && (PEOPLE_VIEWER_ROLES as readonly string[]).includes(role)
  )
}
