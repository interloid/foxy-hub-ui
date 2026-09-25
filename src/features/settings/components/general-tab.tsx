'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/shared/app/user-avatar'
import { FxBadge } from '@/components/shared/fx-badge'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Switch } from '@/components/ui/switch'
import { PROFILE } from '@/features/profile/data'
import type { AccountDTO } from '@/lib/dal'
import { roleLabel } from '@/lib/role'

import { sendTestDigest, updateWeeklyDigest } from '../actions'
import { LanguageRow } from './language-row'
import { ActionLink, Row, Section } from './settings-section'
import { TimeZoneRow } from './time-zone-row'

export function GeneralTab({
  account,
  orgSlug,
}: {
  account: AccountDTO
  orgSlug: string
}) {
  const profileHref = `/${orgSlug}/profile`
  const role = roleLabel(account.role)

  const [weeklyDigest, setWeeklyDigest] = useState(account.weeklyDigest)
  const [serverDigest, setServerDigest] = useState(account.weeklyDigest)
  if (account.weeklyDigest !== serverDigest) {
    setServerDigest(account.weeklyDigest)
    setWeeklyDigest(account.weeklyDigest)
  }
  const [savingDigest, startSavingDigest] = useTransition()

  const [sendingTest, startSendingTest] = useTransition()
  const sendTest = () => {
    startSendingTest(async () => {
      const result = await sendTestDigest(orgSlug)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Test digest sent to ${result.data.email}.`)
    })
  }

  const changeDigest = (enabled: boolean) => {
    setWeeklyDigest(enabled)
    startSavingDigest(async () => {
      const result = await updateWeeklyDigest(enabled)
      if (!result.ok) {
        setWeeklyDigest(!enabled)
        toast.error(result.error)
        return
      }
      toast.success(
        enabled ? 'Weekly digest turned on.' : 'Weekly digest turned off.'
      )
    })
  }

  return (
    <div className="grid gap-10 text-[15px] lg:grid-cols-2 lg:gap-12">
      <Section title="Basics">
        <Row label="Photo">
          <UserAvatar
            initials={account.initials}
            avatarUrl={account.avatarUrl}
            className="size-10 text-sm"
          />
          <ActionLink href={profileHref} className="text-[13.5px]" />
        </Row>

        <Row label="Name">
          <span className="text-muted-foreground truncate text-[14px]">
            {account.fullName?.trim() || PROFILE.noName}
          </span>
          <ActionLink href={profileHref} className="text-[13.5px]" />
        </Row>

        <Row label="Work email">
          <span className="text-muted-foreground truncate text-[14px]">
            {account.email ?? PROFILE.noName}
          </span>
          <ActionLink href={profileHref} className="text-[13.5px]" />
        </Row>

        <Row
          label={
            account.orgName ? `Role in ${account.orgName}` : PROFILE.fields.role
          }
        >
          {role && (
            <FxBadge variant="info" className="text-[12px]">
              {role}
            </FxBadge>
          )}
          <span className="text-subtle-foreground text-[12.5px]">
            Set by an Admin
          </span>
        </Row>
      </Section>

      <Section title="Preferences">
        <Row label="Appearance">
          <ThemeToggle
            variant="switch"
            className="[&>span]:data-[state=checked]:bg-brand-white [&>span]:data-[state=unchecked]:bg-brand-white"
          />
        </Row>

        <LanguageRow locale={account.locale} />

        <TimeZoneRow manualTimeZone={account.manualTimeZone} />

        <Row
          label="Weekly digest"
          hint="Monday summary of your projects, hours and approvals."
        >
          <ActionLink
            disabled={sendingTest}
            onClick={sendTest}
            className="text-[13.5px]"
          >
            {sendingTest ? 'Sending…' : 'Send test'}
          </ActionLink>
          <Switch
            aria-label="Weekly digest"
            checked={weeklyDigest}
            disabled={savingDigest}
            onCheckedChange={changeDigest}
            className="[&>span]:data-[state=checked]:bg-brand-white [&>span]:data-[state=unchecked]:bg-brand-white"
          />
        </Row>
      </Section>
    </div>
  )
}
