import type { FooterProps } from '@/components/layout/app-footer'
import type { NavSection } from '@/components/layout/app-sidebar'
import type { UserRole } from '@/lib/role'

export function getNavSections(org: string): NavSection[] {
  const prefix = org ? `/${org}` : ''

  return [
    {
      items: [
        {
          label: 'Dashboard',
          icon: 'dashboard',
          href: `${prefix}`,
          exact: true,
        },
        { label: 'Projects', icon: 'projects', href: `${prefix}/projects` },
        { label: 'Time', icon: 'time', href: `${prefix}/time` },
        { label: 'Invoices', icon: 'invoices', href: `${prefix}/invoices` },
        { label: 'Reports', icon: 'reports', href: `#` },
        { label: 'AI updates', icon: 'ai', href: `#` },
      ],
    },
    {
      label: 'Workspace',
      items: [
        { label: 'Billing & plan', icon: 'billing', href: `#` },
        {
          label: 'People',
          icon: 'user',
          href: `${prefix}/people`,
        },
        { label: 'Settings', icon: 'settings', href: `${prefix}/settings` },
        { label: 'Auth & demo', icon: 'auth', href: '/sign-in' },
      ],
    },
  ]
}

export function getClientNavSections(org: string): NavSection[] {
  const prefix = org ? `/portal/${org}` : '/portal'

  return [
    {
      items: [
        {
          label: 'Dashboard',
          icon: 'dashboard',
          href: `${prefix}`,
          exact: true,
        },
        { label: 'Projects', icon: 'projects', href: `${prefix}/projects` },
      ],
    },
  ]
}

export function getClientFooter(org: string, orgName?: string): FooterProps {
  const prefix = org ? `/portal/${org}` : '/portal'
  const staff = getFooter(org, orgName)

  return {
    ...staff,
    groups: [
      {
        title: 'Your workspace',
        items: [
          { label: 'Dashboard', href: `${prefix}` },
          { label: 'Projects', href: `${prefix}/projects` },
        ],
      },
      {
        title: 'Resources',
        items: [
          { label: 'Support', href: '#' },
          { label: 'Docs', href: '#' },
        ],
      },
      {
        title: 'Legal',
        items: [
          { label: 'Privacy', href: '#' },
          { label: 'Terms', href: '#' },
        ],
      },
    ],
  }
}

const CONTRIBUTOR_NAV = ['Dashboard', 'Projects', 'Time'] as const

const MANAGER_HIDDEN_NAV = ['Reports'] as const

export function filterNavForRole(
  sections: NavSection[],
  role: UserRole | string | null | undefined
): NavSection[] {
  const normalized = role?.toLowerCase().trim()

  const isVisible =
    normalized === 'contributor'
      ? (label: string) =>
          (CONTRIBUTOR_NAV as readonly string[]).includes(label)
      : normalized === 'manager'
        ? (label: string) =>
            !(MANAGER_HIDDEN_NAV as readonly string[]).includes(label)
        : () => true

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isVisible(item.label)),
    }))
    .filter((section) => section.items.length > 0)
}

export function withInvoiceCount(
  count: number = 0,
  org: string,
  role?: UserRole | string | null
): NavSection[] {
  const sections = filterNavForRole(getNavSections(org), role)
  if (!count) return sections

  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.label === 'Invoices' ? { ...item, count } : item
    ),
  }))
}

export const WORKSPACE = { name: 'Foxy HUB' }
export const APP_VERSION = '0.1.0'

export function getFooter(org: string, orgName?: string): FooterProps {
  const prefix = org ? `/${org}` : ''
  const displayOrgName = orgName?.trim() || org || WORKSPACE.name

  return {
    brand: {
      name: WORKSPACE.name,
      org: displayOrgName,
      year: new Date().getFullYear(),
      tagline:
        'Projects, time and invoices in one workspace for studios that bill by the hour.',
    },
    groups: [
      {
        title: 'Product',
        items: [
          { label: 'Dashboard', href: `${prefix}` },
          { label: 'Projects', href: `${prefix}/projects` },
          { label: 'Time', href: `${prefix}/time` },
          { label: 'Invoices', href: `${prefix}/invoices` },
          { label: 'Reports', href: `#` },
        ],
      },
      {
        title: 'Workspace',
        items: [
          { label: 'Billing & plan', href: `#` },
          { label: 'Settings', href: `#` },
          { label: 'Profile', href: `#` },
          { label: 'AI updates', href: `#` },
        ],
      },
      {
        title: 'Resources',
        items: [
          { label: 'Support', href: `#` },
          { label: 'Docs', href: `#` },
          { label: 'Changelog', href: `#` },
          {
            label: 'Status',
            href: '#',
            external: true,
          },
        ],
      },
      {
        title: 'Legal',
        items: [
          { label: 'Privacy', href: `#` },
          { label: 'Terms', href: `#` },
          { label: 'Security', href: `#` },
          { label: 'Cookies', href: `#` },
        ],
      },
    ],
    social: [
      {
        label: 'GitHub',
        icon: 'github',
        href: 'https://github.com/interloid',
      },
      {
        label: 'LinkedIn',
        icon: 'linkedin',
        href: 'https://www.linkedin.com/company/interloid',
      },
      { label: 'X', icon: 'x', href: 'https://x.com/interloid' },
    ],
    contact: { email: 'support@interloid.co' },
    status: {
      label: 'All systems operational',
      tone: 'success',
      href: `#`,
    },
    meta: { version: `v${APP_VERSION}` },
  }
}
