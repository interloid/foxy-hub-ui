'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatter } from '@/context/locale-provider'
import { isLocale, LOCALE_LABELS, LOCALES, type Locale } from '@/lib/locale'

import { updateLocale } from '../actions'
import { ActionLink, Row } from './settings-section'

export function LanguageRow({ locale: savedLocale }: { locale: Locale }) {
  const [locale, setLocale] = useState(savedLocale)
  const [serverLocale, setServerLocale] = useState(savedLocale)
  if (savedLocale !== serverLocale) {
    setServerLocale(savedLocale)
    setLocale(savedLocale)
  }

  const [editing, setEditing] = useState(false)
  const [saving, startSaving] = useTransition()
  const fmt = useFormatter()

  const change = (value: string) => {
    setEditing(false)
    if (!isLocale(value) || value === locale) return
    const previous = locale
    setLocale(value)
    startSaving(async () => {
      const result = await updateLocale(value)
      if (!result.ok) {
        setLocale(previous)
        toast.error(result.error)
        return
      }
      toast.success(`Dates and numbers now use ${LOCALE_LABELS[value]}.`)
    })
  }

  return (
    <Row label="Language">
      {editing ? (
        <Select
          defaultOpen
          value={locale}
          onValueChange={change}
          onOpenChange={(open) => !open && setEditing(false)}
        >
          <SelectTrigger
            aria-label="Language"
            className="h-9! w-60 cursor-pointer"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="end"
            sideOffset={6}
            className="p-1"
          >
            {LOCALES.map((value) => (
              <SelectItem
                key={value}
                value={value}
                className="cursor-pointer p-2"
              >
                {LOCALE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <>
          <span className="text-muted-foreground text-[14px]">
            {LOCALE_LABELS[locale]}
          </span>
          <ActionLink
            className="text-[13.5px]"
            disabled={saving}
            onClick={() => setEditing(true)}
          >
            Edit
          </ActionLink>
        </>
      )}
    </Row>
  )
}
