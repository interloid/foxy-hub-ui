import type { FooterProps } from '@/components/layout/app-footer'
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
        'Projects, time and invoices in one workspace — for studios that bill by the hour.',
    },
    groups: [
      {
        title: 'Product',
        items: [
          { label: 'Dashboard', href: `${prefix}` },
          { label: 'Projects', href: `${prefix}/projects` },
          { label: 'Time', href: `${prefix}/time` },
          { label: 'Invoices', href: `${prefix}/invoices` },
          { label: 'Reports', href: `${prefix}/reports` },
        ],
      },
      {
        title: 'Workspace',
        items: [
          { label: 'Billing & plan', href: `${prefix}/billing` },
          { label: 'Settings', href: `${prefix}/settings` },
          { label: 'Profile', href: `${prefix}/profile` },
          { label: 'AI updates', href: `${prefix}/ai-updates` },
        ],
      },
      {
        title: 'Resources',
        items: [
          { label: 'Support', href: `${prefix}/support` },
          { label: 'Docs', href: `${prefix}/docs` },
          { label: 'Changelog', href: `${prefix}/changelog` },
          {
            label: 'Status',
            href: 'https://status.interloid.co',
            external: true,
          },
        ],
      },
      {
        title: 'Legal',
        items: [
          { label: 'Privacy', href: `${prefix}/privacy` },
          { label: 'Terms', href: `${prefix}/terms` },
          { label: 'Security', href: `${prefix}/security` },
          { label: 'Cookies', href: `${prefix}/cookies` },
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
      href: `${prefix}/status`,
    },
    meta: { version: `v${APP_VERSION}` },
  }
}
