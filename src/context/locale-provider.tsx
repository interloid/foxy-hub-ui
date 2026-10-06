'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { createFormatter, type Formatter } from '@/lib/format'
import { DEFAULT_LOCALE, type Locale } from '@/lib/locale'

type LocaleSettings = { locale: Locale; timeZone: string | null }

const LocaleContext = createContext<LocaleSettings>({
  locale: DEFAULT_LOCALE,
  timeZone: null,
})

/**
 * The signed-in user's regional format for every client component below it, plus their
 * MANUAL time zone if they fixed one (null in automatic mode, where the browser's own zone
 * already is theirs).
 */
export function LocaleProvider({
  locale,
  timeZone,
  children,
}: LocaleSettings & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, timeZone }), [locale, timeZone])
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale
}

/** Date and number formatting in the user's locale and zone. */
export function useFormatter(): Formatter {
  const { locale, timeZone } = useContext(LocaleContext)
  return useMemo(
    () => createFormatter(locale, timeZone ?? undefined),
    [locale, timeZone]
  )
}
