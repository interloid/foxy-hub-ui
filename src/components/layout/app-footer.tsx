import { cn } from '@/lib/utils'

export function AppFooter({
  brand,
  links,
  status,
  className,
}: {
  brand: { name: string; org: string; year: number }
  links: { label: string; href: string }[]
  status: { label: string; tone?: 'success' | 'warning' | 'destructive' }
  className?: string
}) {
  const tone = status.tone ?? 'success'
  return (
    <footer
      data-slot="app-footer"
      className={cn(
        'border-border mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5 border-t pt-5',
        className
      )}
    >
      <div className="flex items-center gap-2.25">
        <span className="bg-primary text-2xs text-primary-foreground flex size-5.5 shrink-0 items-center justify-center rounded-sm font-bold">
          {brand.name.charAt(0)}
        </span>
        <span className="text-subtle-foreground text-sm">
          {brand.name} © {brand.year} {brand.org} · All rights reserved
        </span>
      </div>

      <div className="flex items-center gap-4.5">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-subtle-foreground hover:text-foreground text-sm transition-colors duration-(--duration-fast)"
          >
            {link.label}
          </a>
        ))}
        <span className="text-subtle-foreground flex items-center gap-1.25 text-xs">
          <span
            aria-hidden
            className={cn(
              'size-1.75 shrink-0 rounded-full',
              tone === 'success' && 'bg-success',
              tone === 'warning' && 'bg-warning',
              tone === 'destructive' && 'bg-destructive'
            )}
          />
          {status.label}
        </span>
      </div>
    </footer>
  )
}
