import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import Link from 'next/link'
import { ComponentProps, ReactNode } from 'react'

const navItemVariants = cva(
  'flex w-full cursor-pointer items-center rounded-md transition-colors duration-(--duration-fast)',
  {
    variants: {
      density: {
        default: 'h-9 gap-2.5 px-2.5 text-base',
        dense: 'h-8 gap-2.5 px-2.5 text-sm',
        product: 'gap-2.5 px-2.5 py-2 text-[13.5px] leading-4.5',
      },
      active: {
        true: 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold',
        false: 'text-muted-foreground font-medium',
      },
    },
    defaultVariants: { density: 'default', active: false },
  }
)

function NavItem({
  className,
  href = '#',
  density,
  active,
  icon = true,
  count,
  collapsed = false,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href'> &
  VariantProps<typeof navItemVariants> & {
    icon?: boolean | ReactNode
    count?: ReactNode
    collapsed?: boolean
    href: string
  }) {
  const isProduct = density === 'product'
  return (
    <Link
      href={href}
      data-slot="nav-item"
      data-active={active || undefined}
      data-collapsed={collapsed || undefined}
      className={cn(
        navItemVariants({ density, active }),
        collapsed && 'justify-center',
        className
      )}
      {...props}
    >
      {icon === true ? (
        <span
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 rounded-lg bg-current',
            density === 'dense' ? 'opacity-55' : 'opacity-60'
          )}
        />
      ) : (
        icon || null
      )}
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">{children}</span>
      )}
      {Boolean(count) &&
        !collapsed &&
        (isProduct ? (
          <span className="bg-sidebar-accent text-2xs text-sidebar-accent-foreground shrink-0 rounded-[20px] px-1.75 py-px leading-3.5 font-semibold">
            {count}
          </span>
        ) : (
          <span
            className={cn(
              'text-subtle-foreground font-mono',
              density === 'dense' ? 'text-[10.5px]' : 'text-2xs'
            )}
          >
            {count}
          </span>
        ))}
    </Link>
  )
}

export { NavItem, navItemVariants }
