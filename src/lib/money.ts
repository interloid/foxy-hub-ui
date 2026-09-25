import type { Locale } from './locale'
import { formatMoney } from './format'

/**
 * Pass `locale` (from `useFormatter()` / `getFormatter()`) to follow the user's regional
 * format. It used to format with the RUNTIME's default locale, which differs between the
 * server and the browser and could render one amount two ways.
 */
export function formatCurrency(
  amount: number,
  currency = 'USD',
  options?: Intl.NumberFormatOptions & { locale?: Locale }
): string {
  return formatMoney(amount, currency, options)
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
}

export function getCurrencySymbol(currency = 'USD'): string {
  return CURRENCY_SYMBOLS[currency] ?? currency
}
