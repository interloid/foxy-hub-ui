'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard } from '@/components/shared/fx-card'
import { FxField, FxInput, FxLabel } from '@/components/shared/fx-field'
import type { AccountDTO } from '@/lib/dal'
import { roleLabel } from '@/lib/role'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { PROFILE } from '../data'
import { AvatarUploadDialog } from './avatar-upload-dialog'
import { EditableEmailField } from './editable-email-field'
import { EditableNameField } from './editable-name-field'
import { UserAvatar } from '@/components/shared/app/user-avatar'

export function ProfileCard({ account }: { account: AccountDTO }) {
  const [fullName, setFullName] = useState<string | null>(account.fullName)
  const [serverName, setServerName] = useState<string | null>(account.fullName)
  if (account.fullName !== serverName) {
    setServerName(account.fullName)
    setFullName(account.fullName)
  }

  const [avatarUrl, setAvatarUrl] = useState<string | null>(account.avatarUrl)
  const [serverAvatarUrl, setServerAvatarUrl] = useState<string | null>(
    account.avatarUrl
  )
  if (account.avatarUrl !== serverAvatarUrl) {
    setServerAvatarUrl(account.avatarUrl)
    setAvatarUrl(account.avatarUrl)
  }
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false)

  const name = fullName?.trim() || account.email?.split('@')[0]
  const initials = account.initials
  const params = useParams()
  const org = params.org as string

  return (
    <FxCard>
      <div className="border-border flex items-center gap-4 border-b px-5 py-5.5">
        <UserAvatar
          initials={initials}
          avatarUrl={avatarUrl}
          className="size-16 text-3xl"
        />
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold">{name}</div>
          <div className="text-subtle-foreground mb-2 truncate text-base">
            {account.email}
          </div>
          {account.role && (
            <FxBadge variant="default" dot className="uppercase">
              {roleLabel(account.role)}
            </FxBadge>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 p-5">
        <FxField>
          <FxLabel className="block leading-normal">
            {PROFILE.photo.label}
          </FxLabel>
          <div className="flex flex-wrap items-center gap-3">
            <FxButton type="button" onClick={() => setIsPhotoDialogOpen(true)}>
              {avatarUrl ? PROFILE.photo.change : PROFILE.photo.upload}
            </FxButton>
            <span className="text-subtle-foreground text-xs">
              {PROFILE.photo.hint}
            </span>
          </div>
        </FxField>

        <EditableNameField fullName={fullName} onSaved={setFullName} />

        <EditableEmailField
          key={account.email ?? ''}
          email={account.email}
          pendingEmail={account.pendingEmail}
          orgSlug={org}
        />
        <ReadOnlyField
          id="role"
          label={PROFILE.fields.role}
          value={roleLabel(account.role)}
        />
      </div>

      <div className="border-border flex items-center justify-center gap-2 border-t px-5 py-3.5">
        <FxButton asChild>
          <Link href={`/${org}/${PROFILE.passwordHref}`}>
            {PROFILE.changePassword}
          </Link>
        </FxButton>
      </div>

      <AvatarUploadDialog
        open={isPhotoDialogOpen}
        onOpenChange={setIsPhotoDialogOpen}
        initials={initials}
        avatarUrl={avatarUrl}
        onSaved={setAvatarUrl}
      />
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
      <FxInput
        id={id}
        inputSize="sm"
        readOnly
        tabIndex={-1}
        value={value}
        className="focus:border-border text-muted-foreground pointer-events-none select-none focus:ring-0"
      />
    </FxField>
  )
}
