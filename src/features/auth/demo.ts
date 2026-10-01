import { z } from 'zod'

export const DEMO_ROLES = [
  {
    role: 'admin',
    label: 'Admin',
    name: 'Priya Nair',
  },
  {
    role: 'manager',
    label: 'Manager',
    name: 'Sofia Reyes',
  },
  {
    role: 'contributor',
    label: 'Contributor',
    name: 'Ana Torres',
  },
  {
    role: 'client',
    label: 'Client',
    name: 'Erik Lund',
  },
] as const

export type DemoRole = (typeof DEMO_ROLES)[number]['role']

export const demoRoleSchema = z.enum(
  DEMO_ROLES.map(({ role }) => role) as [DemoRole, ...DemoRole[]]
)

export const DEMO_DISABLED_MESSAGE = 'Disabled in the demo'
