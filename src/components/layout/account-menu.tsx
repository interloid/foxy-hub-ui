'use client'

import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FxDropdownMenuContent,
  FxDropdownMenuItem,
} from '@/components/shared/fx-menu'
import { signOut } from '@/features/auth/actions'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useTransition } from 'react'
import { FxSpinner } from '../shared/fx-loader'
import { NAV_ICONS } from './nav-icons'

export function AccountMenu({
  account,
  className,
}: {
  account: { name: string; email: string; initials: string; org?: string }
  className?: string
}) {
  const [signingOut, startSignOut] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'border-border bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring flex h-9.5 shrink-0 items-center gap-2 rounded-full border py-1 pr-2 pl-1 transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',

          'max-dash:pr-1',
          className
        )}
      >
        <span className="bg-brand-gradient text-2xs text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full font-semibold">
          {account.initials}
        </span>

        <span className="text-foreground dash:inline hidden text-sm font-medium">
          {account.name}
        </span>
        <NAV_ICONS.chevron
          size={14}
          strokeWidth={1.7}
          className="dash:block hidden"
        />
      </DropdownMenuTrigger>

      <FxDropdownMenuContent
        inset="none"
        className="w-57.5"
        aria-label="Account"
      >
        <DropdownMenuLabel className="border-border flex items-center gap-2.5 border-b p-3.5 font-normal">
          <span className="bg-brand-gradient text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-base font-semibold">
            {account.initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-md text-foreground truncate font-semibold">
              {account.name}
            </span>
            <span className="text-subtle-foreground truncate text-xs font-normal">
              {account.email}
            </span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuGroup className="p-1.5">
          <FxDropdownMenuItem asChild>
            <Link href={`/${account.org}/profile`}>
              <NAV_ICONS.profile strokeWidth={1.7} />
              My profile
            </Link>
          </FxDropdownMenuItem>

          <FxDropdownMenuItem asChild>
            <Link href={`/${account.org}/profile/password`}>
              <NAV_ICONS.auth strokeWidth={1.7} />
              Change password
            </Link>
          </FxDropdownMenuItem>
          <DropdownMenuSeparator className="mx-1 my-1.5" />

          <FxDropdownMenuItem
            variant="destructive"
            disabled={signingOut}

            onSelect={(event) => {
              event.preventDefault()
              startSignOut(async () => {
                await signOut()
              })
            }}
          >
            {signingOut ? (
              <FxSpinner spinnerSize="sm" className="shrink-0" />
            ) : (
              <NAV_ICONS.signOut strokeWidth={1.7} />
            )}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </FxDropdownMenuItem>
        </DropdownMenuGroup>
      </FxDropdownMenuContent>
    </DropdownMenu>
  )
}
