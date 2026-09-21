export function formatCurrency(
  amount: number,
  currency = 'USD',
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    ...options,
  }).format(amount)
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
