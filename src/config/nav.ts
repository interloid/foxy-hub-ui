import type { FooterProps } from '@/components/layout/app-footer'
import type { NavSection } from '@/components/layout/app-sidebar'

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
          label: 'Members & clients',
          icon: 'user',
          href: `${prefix}/members-clients`,
        },
        { label: 'Settings', icon: 'settings', href: `${prefix}/settings` },
        { label: 'Auth & demo', icon: 'auth', href: '/sign-in' },
      ],
    },
  ]
}

/**
 * The portal's sidebar. A separate list rather than a filter over `getNavSections`,
 * because the hrefs live under `/portal/{org}` and the screens behind them are their own.
 */
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

/**
 * `getFooter` links into the staff app — every one of those hrefs would bounce a client
 * back out through the `[org]` gate, so the portal gets its own short list.
 */
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
