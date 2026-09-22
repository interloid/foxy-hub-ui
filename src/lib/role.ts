import type { Database } from '@/types/supabase'

export type UserRole = Database['public']['Enums']['user_role']

/**
 * Staff — everyone who is not a client. Defined POSITIVELY on purpose: the
 * `.neq('role', 'client')` shape that some queries still use silently adopts
 * every role added later, which is how `manager` would have slipped into places
 * nobody reviewed.
 */
export const STAFF_ROLES = [
  'primary_admin',
  'admin',
  'manager',
  'contributor',
] as const satisfies readonly UserRole[]

/**
 * Roles that may act administratively: create projects, invite people, manage
 * the client list.
 *
 * `manager` is here because it does everything an admin does EXCEPT billing,
 * and nothing this flag gates is billing — it guards the New project sheet, the
 * invite action and client create/remove. **Do not reuse it to gate an invoice
 * or subscription surface**, or a manager will be shown a control that RLS then
 * refuses. Billing is primary_admin + admin, enforced in
 * `08_rls_invoices`, `18_rls_invoice_lines`, `11_rls_subscriptions` and
 * `create_invoice_with_entries`.
 */
const ADMIN_ROLES = ['primary_admin', 'admin', 'manager'] as const

/** Who may bill: raise invoices, read the agency's own subscription. */
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

/**
 * Display names. Needed because the stored values are no longer presentable by
 * capitalising the first letter — `primary_admin` renders as "Primary_admin"
 * through both `capitalize` and a `charAt(0).toUpperCase()`, which is exactly
 * what two call sites used to do.
 */
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

/**
 * The staff roles an invitation may name, spelled as the UI spells them.
 *
 * Title Case because that is what the Role selects show and what
 * `invitations.role` is built from: `sendInvitations` lowercases this before the
 * insert, and `invitations_role_check` then vets the result.
 *
 * That `.toLowerCase()` is only a valid mapping while no invitable role's stored
 * value contains an underscore — 'Manager' -> 'manager' works, 'Primary admin'
 * -> 'primary_admin' would NOT. `primary_admin` is unaffected because it is not
 * invitable at all (it is set once, on whoever creates the workspace, and the
 * check constraint refuses it). Any future multi-word role needs a real map here
 * instead.
 */
export type InvitableStaffRole = 'Admin' | 'Manager' | 'Contributor'
