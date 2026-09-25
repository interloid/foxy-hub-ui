import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0">
      <h2 className="text-foreground border-border border-b pb-3 text-[15px] font-semibold">
        {title}
      </h2>
      <div className="divide-border divide-y border-b">{children}</div>
    </section>
  )
}

export function Row({
  label,
  hint,
  icon,
  children,
}: {
  label: string
  hint?: string
  icon?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-0.5 py-3.5">
      <div className="flex min-w-0 items-center gap-3.5">
        {icon && (
          <span className="border-border bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg border">
            {icon}
          </span>
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="text-foreground text-[14px]">{label}</p>
          {hint && (
            <p className="text-subtle-foreground text-[12.5px]">{hint}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">{children}</div>
    </div>
  )
}

const ACTION_LINK_CLASS =
  'text-foreground cursor-pointer border-b-2 border-current text-sm leading-tight font-semibold disabled:cursor-not-allowed disabled:opacity-45'

/** The underlined text action — a link when `href` is given, otherwise a button. */
export function ActionLink({
  children = 'Edit',
  href,
  onClick,
  disabled,
  className,
}: {
  children?: ReactNode
  href?: string
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  if (href) {
    return (
      <Link href={href} className={cn(ACTION_LINK_CLASS, className)}>
        {children}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(ACTION_LINK_CLASS, className)}
    >
      {children}
    </button>
  )
}
