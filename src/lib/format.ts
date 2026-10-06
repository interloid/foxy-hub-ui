import { DEFAULT_LOCALE, type Locale } from './locale'

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
    currencyDisplay: 'narrowSymbol',
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
