import type { NavSection } from '@/components/layout/app-sidebar'

export function getNavSections(org: string): NavSection[] {
  const prefix = org ? `/${org}` : ''

  return [
    {
      items: [
        { label: 'Dashboard', icon: 'dashboard', href: `${prefix}` },
        { label: 'Projects', icon: 'projects', href: `${prefix}/projects` },
        { label: 'Time', icon: 'time', href: `${prefix}/time` },
        { label: 'Invoices', icon: 'invoices', href: `${prefix}/invoices` },
        { label: 'Reports', icon: 'reports', href: `${prefix}/reports` },
        { label: 'AI updates', icon: 'ai', href: `${prefix}/ai-updates` },
      ],
    },
    {
      label: 'Workspace',
      items: [
        { label: 'Billing & plan', icon: 'billing', href: `${prefix}/billing` },
        { label: 'Settings', icon: 'settings', href: `${prefix}/settings` },
        { label: 'Auth & demo', icon: 'auth', href: '/sign-in' },
      ],
    },
  ]
}

export function withInvoiceCount(count: number = 0, org: string): NavSection[] {
  const sections = getNavSections(org)
  if (!count) return sections

  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.label === 'Invoices' ? { ...item, count } : item
    ),
  }))
}

export const WORKSPACE = { name: 'Foxy HUB', org: 'Interloid Studio' }

export const ACCOUNT = {
  name: 'Priya Nair',
  email: 'siva@interloid.co',
  role: 'Admin',
  initials: 'PN',
}

export function getFooter(org: string) {
  const prefix = org ? `/${org}` : ''

  return {
    brand: { name: 'Foxy HUB', org: 'Interloid Studio', year: 2026 },
    links: [
      { label: 'Privacy', href: `${prefix}/privacy` },
      { label: 'Terms', href: `${prefix}/terms` },
      { label: 'Support', href: `${prefix}/support` },
    ],
    status: { label: 'All systems operational', tone: 'success' as const },
  }
}
