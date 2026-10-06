/** The pills on the Activity page. `everything` is no filter. */
export type ActivityCategory =
  'projects' | 'time' | 'invoices' | 'access' | 'workspace' | 'billing'

export const ACTIVITY_CATEGORIES: { id: ActivityCategory; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'time', label: 'Time' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'access', label: 'Access' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'billing', label: 'Billing' },
]

// By `activity_events.type` prefix. The type column is an open set that grows with each
// feature, so anything new and unprefixed here lands under Workspace rather than vanishing.
const PREFIXES: [string, ActivityCategory][] = [
  ['project_', 'projects'],
  ['update_', 'projects'],
  ['delivery_', 'projects'],
  ['asset_', 'projects'],
  ['milestone_', 'projects'],
  ['time_', 'time'],
  ['invoice_', 'invoices'],
  ['member_', 'access'],
  ['client_', 'access'],
  ['members_', 'access'],
  ['invite', 'access'],
  ['role_', 'access'],
  ['workspace_', 'workspace'],
  ['billing_', 'billing'],
  ['subscription_', 'billing'],
  ['plan_', 'billing'],
  ['payment_method', 'billing'],
]

export function categoryOf(type: string): ActivityCategory {
  return (
    PREFIXES.find(([prefix]) => type.startsWith(prefix))?.[1] ?? 'workspace'
  )
}
