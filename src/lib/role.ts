const ADMIN_ROLES = ['owner', 'admin']

export function isAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role.toLowerCase().trim())
}
