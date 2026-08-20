import { cn } from '@/lib/utils'
import Link from 'next/link'
import { NAV_ICONS, SOCIAL_ICONS, type SocialIconName } from './nav-icons'

export type FooterLink = {
  label: string
  href: string
  external?: boolean
}

export type FooterGroup = {
  title: string
  items: FooterLink[]
}

export type FooterProps = {
  brand: { name: string; org: string; year: number; tagline?: string }
  groups: FooterGroup[]
  social?: { label: string; href: string; icon: SocialIconName }[]
  contact?: { email?: string; label?: string }
  status: {
    label: string
    tone?: 'success' | 'warning' | 'destructive'
    href?: string
  }
  meta?: { version?: string }
  className?: string
}

export function AppFooter({
  brand,
  groups,
  social,
  contact,
  status,
  meta,
  className,
}: FooterProps) {
  const tone = status.tone ?? 'success'

  return (
    <footer
      data-slot="app-footer"
      className={cn(
        'border-border shell:-mx-8 shell:px-8 -mx-4 mt-auto border-t px-4 pt-10 pb-8',
        className
      )}
    >
      <div className="dash:grid-cols-2 grid gap-x-8 gap-y-9 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
        <div className="dash:col-span-2 flex flex-col gap-4 lg:col-span-1">
          <div className="flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground shadow-card flex size-8 shrink-0 items-center justify-center rounded-md text-[15px] font-bold">
              {brand.name.charAt(0)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-md leading-tight font-semibold">
                {brand.name}
              </span>
              <span className="text-2xs text-subtle-foreground truncate">
                {brand.org}
              </span>
            </span>
          </div>

          {brand.tagline && (
            <p className="text-subtle-foreground max-w-xs text-sm">
              {brand.tagline}
            </p>
          )}

          {contact?.email && (
            <a
              href={`mailto:${contact.email}`}
              className="text-subtle-foreground hover:text-foreground inline-flex w-fit items-center gap-1.75 text-sm transition-colors duration-(--duration-fast)"
            >
              <NAV_ICONS.mail
                size={14}
                strokeWidth={1.7}
                className="shrink-0"
              />
              {contact.label ?? contact.email}
            </a>
          )}

          {social && social.length > 0 && (
            <ul className="flex items-center gap-2">
              {social.map((item) => {
                const Mark = SOCIAL_ICONS[item.icon]
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={item.label}
                      className="border-border text-subtle-foreground hover:border-border-strong hover:text-foreground focus-visible:ring-ring flex size-8 items-center justify-center rounded-md border transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                      <Mark size={15} />
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {groups.map((group) => (
          <nav key={group.title} className="flex flex-col gap-3">
            <h3 className="text-2xs font-semibold tracking-wide uppercase">
              {group.title}
            </h3>
            <ul className="flex flex-col gap-2.25">
              {group.items.map((link) => (
                <li key={link.href}>
                  <FooterLinkItem {...link} />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-border mt-9 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t pt-5">
        <span className="text-subtle-foreground text-sm">
          © {brand.year} {brand.org} · All rights reserved
        </span>

        <div className="flex items-center gap-3">
          {meta?.version && (
            <span className="text-2xs text-subtle-foreground font-mono">
              {meta.version}
            </span>
          )}
          <StatusPill label={status.label} tone={tone} href={status.href} />
        </div>
      </div>
    </footer>
  )
}

function FooterLinkItem({ label, href, external }: FooterLink) {
  const className =
    'text-subtle-foreground hover:text-foreground inline-flex items-center gap-1 text-base transition-colors duration-(--duration-fast)'

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
        <NAV_ICONS.external size={12} strokeWidth={1.8} className="shrink-0" />
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  )
}

function StatusPill({
  label,
  tone,
  href,
}: {
  label: string
  tone: 'success' | 'warning' | 'destructive'
  href?: string
}) {
  const className = cn(
    'text-2xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-(--duration-fast)',
    tone === 'success' && 'border-success bg-success-subtle text-success',
    tone === 'warning' && 'border-warning bg-warning-subtle text-warning',
    tone === 'destructive' &&
      'border-destructive bg-destructive-subtle text-destructive'
  )

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'size-1.75 shrink-0 rounded-full',
          tone === 'success' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'destructive' && 'bg-destructive'
        )}
      />
      {label}
    </>
  )

  if (!href) return <span className={className}>{body}</span>

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  )
}
