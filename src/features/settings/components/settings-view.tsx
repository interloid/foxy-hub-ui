'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { FxField, FxInput, FxLabel } from '@/components/shared/fx-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { env } from '@/config/env'

import { updateWorkingDayAction } from '../actions'
import type { WorkspaceSettings } from '../types'
import { EditWorkspaceSheet } from './edit-workspace-sheet'

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'INR', label: 'INR (₹)' },
]

const ROUNDING_OPTIONS = [1, 5, 6, 10, 15, 30, 60]

/** Workspaces are a path on one domain, not a subdomain each — `foxyhub.app/interloid`. */
const APP_DOMAIN = env.NEXT_PUBLIC_APP_DOMAIN ?? 'yourdomain.com'

export function SettingsView({
  settings,
  orgSlug,
}: {
  settings: WorkspaceSettings
  orgSlug: string
}) {
  const [hours, setHours] = useState(String(settings.dailyCapacityHours))
  const [days, setDays] = useState(String(settings.daysPerWeek))
  const [currency, setCurrency] = useState(settings.currency)
  const [rounding, setRounding] = useState(String(settings.roundingMinutes))
  const [isSaving, setIsSaving] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const isDirty =
    hours !== String(settings.dailyCapacityHours) ||
    days !== String(settings.daysPerWeek) ||
    currency !== settings.currency ||
    rounding !== String(settings.roundingMinutes)

  const handleSave = async () => {
    setIsSaving(true)
    const result = await updateWorkingDayAction(orgSlug, {
      dailyCapacityHours: Number(hours),
      daysPerWeek: Number(days),
      currency,
      roundingMinutes: Number(rounding),
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('Workspace settings saved.')
  }

  const seatLabel = settings.seatsTotal
    ? `${settings.seatsUsed} of ${settings.seatsTotal} seats used`
    : `${settings.seatsUsed} ${settings.seatsUsed === 1 ? 'seat' : 'seats'} used`

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="space-y-1">
        <h1 className="text-foreground text-[22px] font-medium tracking-tight">
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Workspace, members, and client access.
        </p>
      </div>

      <FxCard>
        <FxCardContent className="space-y-4 p-5">
          <h2 className="text-foreground text-[14px] font-semibold">
            Workspace
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                aria-hidden="true"
                className="bg-primary text-brand-white flex size-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold"
              >
                {settings.name.trim().charAt(0).toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-foreground truncate text-[14px] font-semibold">
                  {settings.name}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {APP_DOMAIN}/{settings.slug}
                </p>
              </div>
            </div>

            {settings.canEdit && (
              <FxButton
                variant="secondary"
                size="xs"
                onClick={() => setIsEditOpen(true)}
              >
                Edit
              </FxButton>
            )}
          </div>
        </FxCardContent>
      </FxCard>

      <FxCard>
        <FxCardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 className="text-foreground text-[14px] font-semibold">
              Working day &amp; billing
            </h2>
            <p className="text-muted-foreground text-sm">
              The baseline every capacity warning, timesheet, and invoice is
              measured against. Changes apply across the workspace.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FxField className="pb-0">
              <FxLabel htmlFor="standard-day">Standard day (hours)</FxLabel>
              <FxInput
                id="standard-day"
                type="number"
                min={1}
                max={24}
                disabled={!settings.canEdit}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </FxField>

            <FxField className="pb-0">
              <FxLabel htmlFor="days-per-week">Days per week</FxLabel>
              <FxInput
                id="days-per-week"
                type="number"
                min={1}
                max={7}
                disabled={!settings.canEdit}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </FxField>

            <FxField className="pb-0">
              <FxLabel htmlFor="currency">Currency</FxLabel>
              <Select
                value={currency}
                onValueChange={setCurrency}
                disabled={!settings.canEdit}
              >
                <SelectTrigger
                  id="currency"
                  className="h-11! w-full cursor-pointer"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="p-1"
                >
                  {CURRENCIES.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="cursor-pointer p-2"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FxField>

            <FxField className="pb-0">
              <FxLabel htmlFor="rounding">Rounding (minutes)</FxLabel>
              <Select
                value={rounding}
                onValueChange={setRounding}
                disabled={!settings.canEdit}
              >
                <SelectTrigger
                  id="rounding"
                  className="h-11! w-full cursor-pointer"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="p-1"
                >
                  {ROUNDING_OPTIONS.map((minutes) => (
                    <SelectItem
                      key={minutes}
                      value={String(minutes)}
                      className="cursor-pointer p-2"
                    >
                      {minutes} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FxField>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              Rounding is applied only at invoice generation, and the rule is
              printed on each invoice.
            </p>

            {settings.canEdit && (
              <FxButton
                size="xs"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </FxButton>
            )}
          </div>
        </FxCardContent>
      </FxCard>

      <FxCard>
        <FxCardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 space-y-1">
            <h2 className="text-foreground text-[14px] font-semibold">
              Members &amp; clients
            </h2>
            <p className="text-muted-foreground text-sm">
              Invites, roles, portal access and deactivation live on their own
              screen — {seatLabel}, {settings.pendingInvites}{' '}
              {settings.pendingInvites === 1 ? 'invite' : 'invites'} pending.
            </p>
          </div>

          <FxButton variant="secondary" asChild className="gap-1.5">
            <Link href={`/${orgSlug}/members-clients`}>
              Open Members &amp; clients
              <ArrowRight className="size-4" />
            </Link>
          </FxButton>
        </FxCardContent>
      </FxCard>

      <EditWorkspaceSheet
        orgSlug={orgSlug}
        currentName={settings.name}
        slug={settings.slug}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
    </div>
  )
}
