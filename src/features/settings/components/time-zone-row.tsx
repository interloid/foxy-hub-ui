'use client'

import { useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import { toast } from 'sonner'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Switch } from '@/components/ui/switch'
import { gmtOffsetLabel } from '@/lib/date'
import { deviceTimeZone, FALLBACK_TIME_ZONE } from '@/lib/time-zone'

import { updateTimeZone } from '../actions'
import { ActionLink, Row } from './settings-section'

const subscribeNever = () => () => {}

function useDeviceTimeZone(): string | null {
  return useSyncExternalStore(subscribeNever, deviceTimeZone, () => null)
}

/**
 * Chrome and Node still list these zones under their pre-rename IANA names, so searching
 * "Kolkata" or "Kyiv" found nothing. The current names are valid everywhere a zone is used
 * (Intl, isValidTimeZone, Postgres), so the list shows and saves those instead.
 */
const RENAMED_ZONES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'Africa/Asmera': 'Africa/Asmara',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Godthab': 'America/Nuuk',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
}

const currentName = (zone: string) => RENAMED_ZONES[zone] ?? zone

function allTimeZones(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : []
  const zones = [...new Set(supported.map(currentName))]
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

const readable = (zone: string) => currentName(zone).replace(/_/g, ' ')

function zoneLabel(zone: string): string {
  return `${readable(zone).replace(/\//g, ' / ')} (${gmtOffsetLabel(zone)})`
}

export function TimeZoneRow({
  manualTimeZone,
}: {
  manualTimeZone: string | null
}) {
  const device = useDeviceTimeZone()
  const [manual, setManual] = useState(manualTimeZone)
  const [serverManual, setServerManual] = useState(manualTimeZone)
  if (manualTimeZone !== serverManual) {
    setServerManual(manualTimeZone)
    setManual(manualTimeZone)
  }

  const [choosing, setChoosing] = useState(false)
  const [saving, startSaving] = useTransition()
  const zones = useMemo(() => (choosing ? allTimeZones() : []), [choosing])

  const automatic = manual === null
  // A zone saved under its old name ("Asia/Calcutta") is the same list item.
  const selectedZone = manual === null ? null : currentName(manual)
  const activeZone = manual ?? device

  const save = (zone: string | null) => {
    const previous = manual
    setManual(zone)
    setChoosing(false)
    startSaving(async () => {
      const result = await updateTimeZone(zone)
      if (!result.ok) {
        setManual(previous)
        toast.error(result.error)
        return
      }
      toast.success(
        zone
          ? `Time zone fixed to ${readable(zone)}.`
          : 'Time zone now follows your device.'
      )
    })
  }

  return (
    <Row
      label="Automatic time zone"
      hint={
        automatic
          ? 'Timesheet dates follow the device you log from.'
          : `Fixed to ${readable(manual)} on every device.`
      }
    >
      {choosing ? (
        <Combobox
          items={zones}
          defaultValue={selectedZone}
          defaultInputValue=""
          defaultOpen
          openOnInputClick
          autoHighlight
          itemToStringLabel={(item: string) => zoneLabel(item)}
          onValueChange={(value) => {
            const zone = value as string | null
            if (!zone) return
            if (zone !== selectedZone) save(zone)
            else setChoosing(false)
          }}
          onOpenChange={(open) => {
            if (!open) setChoosing(false)
          }}
        >
          <ComboboxInput
            aria-label="Time zone"
            placeholder="Search, e.g. Kolkata"
            autoFocus
            className="w-64"
          />
          <ComboboxContent align="end">
            <div className="py-3">
              <ComboboxEmpty>No time zone found.</ComboboxEmpty>

              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem
                    key={item}
                    value={item}
                    className="hover:bg-primary data-highlighted:bg-primary cursor-pointer p-2"
                  >
                    {zoneLabel(item)}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </div>
          </ComboboxContent>
        </Combobox>
      ) : (
        <>
          <span
            className="text-muted-foreground font-mono text-[14px]"
            title={activeZone ?? undefined}
          >
            {activeZone ? gmtOffsetLabel(activeZone) : ''}
          </span>
          {!automatic && (
            <ActionLink disabled={saving} onClick={() => setChoosing(true)}>
              Change
            </ActionLink>
          )}
        </>
      )}

      <Switch
        aria-label="Automatic time zone"
        className="text-brand-white [&>span]:data-[state=checked]:bg-brand-white [&>span]:data-[state=unchecked]:bg-brand-white"
        checked={automatic}
        disabled={saving || (!automatic && choosing)}
        onCheckedChange={(checked) =>
          save(checked ? null : (device ?? FALLBACK_TIME_ZONE))
        }
      />
    </Row>
  )
}
