'use client'

import {
  HelpCircle,
  Monitor,
  Smartphone,
  Tablet,
  type LucideIcon,
} from 'lucide-react'
import { useState, useSyncExternalStore, useTransition } from 'react'
import { toast } from 'sonner'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useFormatter } from '@/context/locale-provider'
import { PROFILE } from '@/features/profile/data'
import { dateIn, daysAgoIn } from '@/lib/date'
import type { Formatter } from '@/lib/format'
import {
  INACTIVITY_LABELS,
  INACTIVITY_TIMEOUTS,
  isInactivityTimeout,
  type InactivityTimeout,
} from '@/lib/inactivity'

import {
  signOutDevice,
  signOutOtherDevices,
  updateInactivityTimeout,
} from '../actions'
import type { DeviceKind, DeviceSession } from '../types'

import { ActionLink, Row, Section } from './settings-section'
import {
  DisableTwoFactorDialog,
  EnableTwoFactorDialog,
} from './two-factor-dialogs'

const DEVICE_ICONS: Record<DeviceKind, LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: HelpCircle,
}

const ACTIVE_NOW_MS = 5 * 60 * 1000

/** The formatter's zone — the user's chosen one, else the device's. */
function zoneOf(fmt: Formatter): string {
  return fmt.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * "Today / Yesterday" is decided in the SAME zone the time is printed in (RISK-026). It
 * used the device's zone, so a user whose chosen zone differs saw "Yesterday, 8:30 AM"
 * for 8:30 this morning.
 */
function describeActivity(
  iso: string,
  isCurrent: boolean,
  fmt: Formatter
): string {
  const seen = new Date(iso)
  const now = new Date()
  if (isCurrent || now.getTime() - seen.getTime() < ACTIVE_NOW_MS) {
    return 'Active now'
  }

  const zone = zoneOf(fmt)
  const days = daysAgoIn(zone, seen, now)
  if (days <= 0) return `Today, ${fmt.date(seen, 'time')}`
  if (days === 1) return `Yesterday, ${fmt.date(seen, 'time')}`
  const sameYear =
    dateIn(zone, seen).slice(0, 4) === dateIn(zone, now).slice(0, 4)
  return sameYear ? fmt.date(seen, 'day') : fmt.date(seen, 'date')
}

const subscribeNever = () => () => {}

function useIsBrowser() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
}

/**
 * "Last changed today / yesterday / 5 days ago / on 12 Sept 2026". Days are counted on the
 * formatter's calendar (the user's zone). Undefined when no date was ever recorded —
 * existing accounts until their next password change — rather than inventing one.
 */
function describePasswordChange(
  iso: string | null,
  fmt: Formatter
): string | undefined {
  if (!iso) return undefined
  // Calendar days in the user's zone, via ISO dates — not the displayed format, which
  // is day-first or month-first depending on the language.
  const days = daysAgoIn(zoneOf(fmt), iso)
  if (days <= 0) return 'Last changed today'
  if (days === 1) return 'Last changed yesterday'
  if (days < 30) return `Last changed ${days} days ago`
  return `Last changed on ${fmt.date(iso, 'date')}`
}

export function SecurityTab({
  orgSlug,
  inactivityTimeout,
  devices,
  mfaEnabled,
  passwordChangedAt,
}: {
  orgSlug: string
  inactivityTimeout: InactivityTimeout
  devices: DeviceSession[]
  mfaEnabled: boolean
  passwordChangedAt: string | null
}) {
  const [twoFactor, setTwoFactor] = useState(mfaEnabled)
  const [serverMfaEnabled, setServerMfaEnabled] = useState(mfaEnabled)
  if (mfaEnabled !== serverMfaEnabled) {
    setServerMfaEnabled(mfaEnabled)
    setTwoFactor(mfaEnabled)
  }
  const [twoFactorDialog, setTwoFactorDialog] = useState<
    'enable' | 'disable' | null
  >(null)
  const [inactivity, setInactivity] = useState(inactivityTimeout)
  // Follow the server's value when the page refreshes with a new one (RISK-027) — changed
  // in another tab, say — the same way the two-factor switch does above.
  const [serverInactivity, setServerInactivity] = useState(inactivityTimeout)
  if (inactivityTimeout !== serverInactivity) {
    setServerInactivity(inactivityTimeout)
    setInactivity(inactivityTimeout)
  }
  const [savingInactivity, startSavingInactivity] = useTransition()
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [signingOut, startSigningOut] = useTransition()
  const isBrowser = useIsBrowser()
  const fmt = useFormatter()

  const visibleDevices = devices.filter(
    (device) => !removed.has(device.sessionId)
  )
  const others = visibleDevices.filter((device) => !device.isCurrent)

  const hide = (ids: string[]) =>
    setRemoved((current) => new Set([...current, ...ids]))
  const unhide = (ids: string[]) =>
    setRemoved((current) => {
      const next = new Set(current)
      ids.forEach((id) => next.delete(id))
      return next
    })

  const changeInactivity = (value: string) => {
    if (!isInactivityTimeout(value) || value === inactivity) return
    const previous = inactivity
    setInactivity(value)
    startSavingInactivity(async () => {
      const result = await updateInactivityTimeout(value)
      if (!result.ok) {
        setInactivity(previous)
        toast.error(result.error)
        return
      }
      toast.success(
        value === 'never'
          ? 'You will stay signed in until you sign out.'
          : `You will be signed out ${INACTIVITY_LABELS[value].toLowerCase()} of inactivity.`
      )
    })
  }

  const handleSignOutDevice = (device: DeviceSession) => {
    hide([device.sessionId])
    startSigningOut(async () => {
      const result = await signOutDevice(device.sessionId)
      if (!result.ok) {
        unhide([device.sessionId])
        toast.error(result.error)
        return
      }
      toast.success(`Signed out of ${device.name}.`)
    })
  }

  const handleSignOutOthers = () => {
    const ids = others.map((device) => device.sessionId)
    hide(ids)
    startSigningOut(async () => {
      const result = await signOutOtherDevices()
      if (!result.ok) {
        unhide(ids)
        toast.error(result.error)
        return
      }
      toast.success('Signed out of every other device.')
    })
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
      <Section title="Sign in">
        <Row
          label="Password"
          hint={
            isBrowser
              ? describePasswordChange(passwordChangedAt, fmt)
              : undefined
          }
        >
          <ActionLink
            href={`/${orgSlug}/${PROFILE.passwordHref}`}
            className="text-[13.5px]"
          >
            Change
          </ActionLink>
        </Row>

        <Row
          label="Two-factor authentication"
          hint="A code from your authenticator app each time you sign in."
        >
          <span className="text-muted-foreground text-[14px]">
            {twoFactor ? 'On' : 'Off'}
          </span>
          <Switch
            aria-label="Two-factor authentication"
            checked={twoFactor}
            onCheckedChange={(checked) =>
              setTwoFactorDialog(checked ? 'enable' : 'disable')
            }
          />
        </Row>

        <Row
          label="Sign out after inactivity"
          hint="Applies to this account on shared machines."
        >
          <Select
            value={inactivity}
            onValueChange={changeInactivity}
            disabled={savingInactivity}
          >
            <SelectTrigger
              aria-label="Sign out after inactivity"
              className="bg-sidebar border-border h-10! w-35 cursor-pointer text-[13px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="end"
              sideOffset={6}
              className="p-1"
            >
              {INACTIVITY_TIMEOUTS.map((value) => (
                <SelectItem
                  key={value}
                  value={value}
                  className="cursor-pointer p-2"
                >
                  {INACTIVITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section title="Devices">
        {visibleDevices.map((device) => {
          const Icon = DEVICE_ICONS[device.kind]
          return (
            <Row
              key={device.sessionId}
              label={device.name}
              hint={[
                device.location ?? 'Unknown location',
                isBrowser &&
                  describeActivity(device.lastSeenAt, device.isCurrent, fmt),
              ]
                .filter(Boolean)
                .join(' · ')}
              icon={<Icon className="size-4" strokeWidth={1.7} />}
            >
              {device.isCurrent ? (
                <FxBadge variant="success">This device</FxBadge>
              ) : (
                <ActionLink
                  disabled={signingOut}
                  onClick={() => handleSignOutDevice(device)}
                  className="text-[13.5px]"
                >
                  Sign out
                </ActionLink>
              )}
            </Row>
          )
        })}

        <Row
          label="Sign out everywhere else"
          hint="Ends every session except this one."
        >
          <FxButton
            type="button"
            variant="secondary"
            disabled={others.length === 0 || signingOut}
            onClick={handleSignOutOthers}
            className="hover:bg-card text-[13px]"
          >
            Sign out others
          </FxButton>
        </Row>
      </Section>

      <EnableTwoFactorDialog
        open={twoFactorDialog === 'enable'}
        onOpenChange={(open) => !open && setTwoFactorDialog(null)}
        onEnabled={() => setTwoFactor(true)}
      />
      <DisableTwoFactorDialog
        open={twoFactorDialog === 'disable'}
        onOpenChange={(open) => !open && setTwoFactorDialog(null)}
        onDisabled={() => setTwoFactor(false)}
      />
    </div>
  )
}
