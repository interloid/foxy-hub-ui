'use client'

import Link from 'next/link'
import * as React from 'react'
import { signOut } from '@/features/auth/actions'
import type { AccountDTO } from '@/lib/dal'
import { initialsOf } from '@/lib/initials'
import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard } from '@/components/shared/fx-card'
import { FxField, FxInput, FxLabel } from '@/components/shared/fx-field'
import { PROFILE } from '../data'
import { EditableNameField } from './editable-name-field'

export function ProfileCard({ account }: { account: AccountDTO }) {
  const [signingOut, startSignOut] = React.useTransition()

  const [fullName, setFullName] = React.useState(account.fullName)
  const [serverName, setServerName] = React.useState(account.fullName)
  if (account.fullName !== serverName) {
    setServerName(account.fullName)
    setFullName(account.fullName)
  }

  const name = fullName?.trim() || PROFILE.noName
  const initials = initialsOf(fullName, account.email)

  return (
    <FxCard>
      <div className="border-border flex items-center gap-4 border-b px-5 py-5.5">
        <span className="bg-brand-gradient text-primary-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-3xl font-semibold">
          {initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold">{name}</div>
          <div className="text-subtle-foreground mb-2 truncate text-base">
            {account.email}
          </div>
          {account.role ? (
            <FxBadge variant="default" dot>
              {account.role}
            </FxBadge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 p-5">
        <EditableNameField fullName={fullName} onSaved={setFullName} />

        <ReadOnlyField
          id="email"
          label={PROFILE.fields.email}
          value={account.email ?? ''}
        />
        <ReadOnlyField
          id="role"
          label={PROFILE.fields.role}
          value={account.role ?? ''}
        />

        <p className="text-subtle-foreground text-xs">{PROFILE.managed}</p>
      </div>

      <div className="border-border flex items-center justify-between gap-2 border-t px-5 py-3.5">
        <FxButton
          type="button"
          variant="outline"
          className="text-destructive hover:bg-destructive-subtle hover:text-destructive"
          disabled={signingOut}
          onClick={() =>
            startSignOut(async () => {
              await signOut()
            })
          }
        >
          {signingOut ? 'Signing out…' : PROFILE.signOut}
        </FxButton>
        <FxButton asChild>
          <Link href={PROFILE.passwordHref}>{PROFILE.changePassword}</Link>
        </FxButton>
      </div>
    </FxCard>
  )
}

function ReadOnlyField({
  id,
  label,
  value,
}: {
  id: string
  label: string
  value: string
}) {
  return (
    <FxField>
      <FxLabel htmlFor={id} className="block leading-normal">
        {label}
      </FxLabel>
      <FxInput id={id} inputSize="sm" readOnly value={value} />
    </FxField>
  )
}
