import type { Database } from '@/types/supabase'

export type UserRole = Database['public']['Enums']['user_role']

export const STAFF_ROLES = [
  'primary_admin',
  'admin',
  'manager',
  'contributor',
] as const satisfies readonly UserRole[]

const ADMIN_ROLES = ['primary_admin', 'admin'] as const

const BILLING_ROLES = ['primary_admin', 'admin'] as const

export function isAdminRole(role: string | null | undefined): boolean {
  return (
    role != null &&
    (ADMIN_ROLES as readonly string[]).includes(role.toLowerCase().trim())
  )
}

export function isBillingRole(role: string | null | undefined): boolean {
  return (
    role != null &&
    (BILLING_ROLES as readonly string[]).includes(role.toLowerCase().trim())
  )
}

const ROLE_LABELS: Record<UserRole, string> = {
  primary_admin: 'Primary admin',
  admin: 'Admin',
  manager: 'Manager',
  contributor: 'Contributor',
  client: 'Client',
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABELS[role as UserRole] ?? role
}

export type InvitableStaffRole = 'Admin' | 'Manager' | 'Contributor'
