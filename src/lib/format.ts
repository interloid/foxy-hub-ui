import { DEFAULT_LOCALE, type Locale } from './locale'

/**
 * Every date, time and number the app SHOWS goes through here, so one setting decides
 * how they read. Components ask for a named style instead of a hard-coded pattern:
 *
 *   day      Sep 23            23 Sept
 *   date     Sep 23, 2026      23 Sept 2026
 *   long     September 23, 2026  23 September 2026
 *   numeric  09/23/2026        23/09/2026
 *   month    Sep               Sept
 *   time     1:34 PM           13:34
 *   dateTime Sep 23, 1:34 PM   23 Sept, 13:34
 *
 * (en-US on the left, en-GB on the right.)
 *
 * A plain 'YYYY-MM-DD' (a `date` column such as `due_date`) is a calendar day with no
 * clock, so it is formatted in UTC — otherwise anyone west of Greenwich would see the day
 * before. Timestamps are shown in `timeZone` when given (server code passes the user's),
 * else in the runtime's own zone (the browser's, on the client).
 */

export type DateStyle =
  'day' | 'date' | 'long' | 'numeric' | 'month' | 'time' | 'dateTime'

const STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  day: { month: 'short', day: 'numeric' },
  date: { month: 'short', day: 'numeric', year: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  numeric: { month: '2-digit', day: '2-digit', year: 'numeric' },
  month: { month: 'short' },
  time: { hour: 'numeric', minute: '2-digit' },
  dateTime: {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export type FormatOptions = { locale?: Locale; timeZone?: string }

export function formatDate(
  value: Date | string | number,
  style: DateStyle,
  { locale = DEFAULT_LOCALE, timeZone }: FormatOptions = {}
): string {
  const isDateOnly = typeof value === 'string' && DATE_ONLY.test(value)
  const date = isDateOnly
    ? new Date(`${value}T00:00:00Z`)
    : value instanceof Date
      ? value
      : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(locale, {
    ...STYLES[style],
    ...(isDateOnly ? { timeZone: 'UTC' } : timeZone ? { timeZone } : {}),
  }).format(date)
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions & { locale?: Locale }
): string {
  const { locale = DEFAULT_LOCALE, ...rest } = options ?? {}
  return new Intl.NumberFormat(locale, rest).format(value)
}

export function formatMoney(
  amount: number,
  currency = 'USD',
  options?: Intl.NumberFormatOptions & { locale?: Locale }
): string {
  const { locale = DEFAULT_LOCALE, ...rest } = options ?? {}
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    ...rest,
  }).format(amount)
}

/** The same helpers with the locale (and zone) already applied. */
export type Formatter = {
  locale: Locale
  /** The zone timestamps are shown in; undefined = the runtime's own zone. */
  timeZone: string | undefined
  date: (value: Date | string | number, style: DateStyle) => string
  number: (value: number, options?: Intl.NumberFormatOptions) => string
  currency: (
    amount: number,
    currency?: string,
    options?: Intl.NumberFormatOptions
  ) => string
}

export function createFormatter(locale: Locale, timeZone?: string): Formatter {
  return {
    locale,
    timeZone,
    date: (value, style) => formatDate(value, style, { locale, timeZone }),
    number: (value, options) => formatNumber(value, { ...options, locale }),
    currency: (amount, currency, options) =>
      formatMoney(amount, currency, { ...options, locale }),
  }
}

/** What an empty numeric date field shows: MM/DD/YYYY for en-US, DD/MM/YYYY elsewhere. */
export function numericDatePlaceholder(
  locale: Locale = DEFAULT_LOCALE
): string {
  return locale === 'en-US' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'
}
