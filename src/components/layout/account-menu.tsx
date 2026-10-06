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
import { siteConfig } from '@/config/site'
import { signOut } from '@/features/auth/actions'
import { roleLabel } from '@/lib/role'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { notifyOtherTabsOnLogout } from '../common/tab-session-sync'
import { UserAvatar } from '../shared/app/user-avatar'
import { FxBadge } from '../shared/fx-badge'
import { FxConfirmDialog } from '../shared/fx-confirm-dialog'
import { NAV_ICONS } from './nav-icons'

export function AccountMenu({
  account,
  className,
}: {
  account: {
    name: string
    email: string
    initials: string
    avatarUrl?: string | null
    role: string
    org?: string
  }
  className?: string
}) {
  const [signingOut, startSignOut] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()
  const orgPath = account.org
    ? `/${encodeURIComponent(account.org.toLowerCase().trim().replace(/\s+/g, '-'))}`
    : ''

  const profileHref = `${orgPath}/profile`
  const passwordHref = `${orgPath}/profile/password`

  const handleSignOut = () => {
    notifyOtherTabsOnLogout()
    startSignOut(async () => {
      await signOut()
      router.push('/sign-in')
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'md:border-border bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring flex h-9.5 shrink-0 cursor-pointer items-center gap-2 rounded-full border py-1 pr-2 pl-1 transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',

            'max-dash:pr-1',
            className
          )}
        >
          <UserAvatar
            initials={account.initials}
            avatarUrl={account.avatarUrl}
            className="text-2xs size-7 uppercase"
          />

          <div className="text-foreground dash:flex hidden gap-2 text-sm font-medium">
            <div>{account.name}</div>

            <FxBadge variant={'info'} size={'sm'}>
              {roleLabel(account.role)}
            </FxBadge>
          </div>
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
            <UserAvatar
              initials={account.initials}
              avatarUrl={account.avatarUrl}
              className="size-9 text-base"
            />
            <span className="flex w-full min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="text-md text-foreground truncate font-semibold">
                  {account.name}
                </span>
                {account.role && (
                  <FxBadge variant={'info'} size={'sm'}>
                    {roleLabel(account.role)}
                  </FxBadge>
                )}
              </div>

              <span className="text-subtle-foreground truncate text-xs font-normal">
                {account.email}
              </span>
            </span>
          </DropdownMenuLabel>

          <DropdownMenuGroup className="p-1.5">
            <FxDropdownMenuItem asChild>
              <Link href={profileHref}>
                <NAV_ICONS.profile strokeWidth={1.7} />
                My profile
              </Link>
            </FxDropdownMenuItem>

            <FxDropdownMenuItem asChild>
              <Link href={passwordHref}>
                <NAV_ICONS.auth strokeWidth={1.7} />
                Change password
              </Link>
            </FxDropdownMenuItem>
            <DropdownMenuSeparator className="mx-1 my-1.5" />

            <FxDropdownMenuItem
              variant="destructive"
              disabled={signingOut}
              onSelect={() => setConfirmOpen(true)}
            >
              <NAV_ICONS.signOut strokeWidth={1.7} />
              Sign out
            </FxDropdownMenuItem>
          </DropdownMenuGroup>
        </FxDropdownMenuContent>
      </DropdownMenu>

      {/* Outside the menu, so closing the menu does not unmount the dialog. */}
      <FxConfirmDialog
        open={confirmOpen || signingOut}
        onOpenChange={(open) => !signingOut && setConfirmOpen(open)}
        title={`Sign out of ${account.org || siteConfig.name}?`}
        description="Anything you have typed but not saved in an open panel is dropped. You will land back on the sign-in screen."
        confirmLabel="Sign out"
        pendingLabel="Signing out…"
        isPending={signingOut}
        onConfirm={handleSignOut}
      />
    </>
  )
}
