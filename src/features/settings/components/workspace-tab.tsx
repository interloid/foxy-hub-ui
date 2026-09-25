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

import { AccountDTO } from '@/lib/dal'
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

const APP_DOMAIN = env.NEXT_PUBLIC_APP_DOMAIN ?? 'yourdomain.com'

export function WorkspaceTab({
  settings,
  orgSlug,
  account,
}: {
  settings: WorkspaceSettings
  orgSlug: string
  account: AccountDTO
}) {
  const [hours, setHours] = useState(String(settings.dailyCapacityHours))
  const [days, setDays] = useState(String(settings.daysPerWeek))
  const [currency, setCurrency] = useState(settings.currency)
  const [rounding, setRounding] = useState(String(settings.roundingMinutes))
  const [isSaving, setIsSaving] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const ROLE = ['admin', 'primary_admin']
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
                <p className="text-foreground truncate text-[15px] font-semibold">
                  {settings.name}
                </p>
                <p className="text-muted-foreground truncate text-[12.5px]">
                  {APP_DOMAIN}/{settings.slug}
                </p>
              </div>
            </div>

            {account.role && ROLE?.includes(account?.role) && (
              <FxButton
                variant="secondary"
                size="sm"
                onClick={() => setIsEditOpen(true)}
                className="bg-muted"
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
            <p className="text-muted-foreground text-[12.5px]">
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
                disabled={account.role === null || !ROLE.includes(account.role)}
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
                disabled={account.role === null || !ROLE.includes(account.role)}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </FxField>

            <FxField className="pb-0">
              <FxLabel htmlFor="currency">Currency</FxLabel>
              <Select
                value={currency}
                onValueChange={setCurrency}
                disabled={account.role === null || !ROLE.includes(account.role)}
              >
                <SelectTrigger
                  id="currency"
                  className="bg-muted h-11! w-full cursor-pointer"
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
                disabled={account.role === null || !ROLE.includes(account.role)}
              >
                <SelectTrigger
                  id="rounding"
                  className="bg-muted h-11! w-full cursor-pointer"
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

            {account.role !== null && ROLE.includes(account.role) && (
              <FxButton
                size="default"
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
              People
            </h2>
            <p className="text-muted-foreground text-sm">
              Invites, roles, portal access and deactivation live on their own
              screen — {seatLabel}, {settings.pendingInvites}{' '}
              {settings.pendingInvites === 1 ? 'invite' : 'invites'} pending.
            </p>
          </div>

          <FxButton variant="secondary" asChild className="bg-muted gap-1.5">
            <Link href={`/${orgSlug}/people`}>
              Open People
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
