'use client'

import { useFormatter } from '@/context/locale-provider'

import { PAYMENT_STATUS } from '../lib/payment-status'
import type { BillingCharge } from '../types'

/** Whole amounts as "$49", anything with cents (a prorated upgrade) as "$74.50". */
export function useMoney() {
  const fmt = useFormatter()
  return (amount: number, currency: string) =>
    fmt.currency(amount, currency, {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })
}

/**
 * How account credit paid for a charge, or null when the card paid it all:
 * "Paid from account credit" / "$44.50 from account credit, $30 by card".
 */
export function describeCreditPayment(
  charge: Pick<BillingCharge, 'amount' | 'creditApplied' | 'currency'>,
  money: (amount: number, currency: string) => string
): string | null {
  if (charge.creditApplied <= 0) return null
  const byCard = Math.round((charge.amount - charge.creditApplied) * 100) / 100
  return byCard <= 0
    ? 'Paid from account credit'
    : `${money(charge.creditApplied, charge.currency)} from account credit, ${money(byCard, charge.currency)} by card`
}

export function useCreditNote() {
  const money = useMoney()
  return (charge: BillingCharge) => describeCreditPayment(charge, money)
}

/** "Refunded $20" for a partial refund, otherwise the status label ("Paid", "Failed"…). */
export function useChargeStatusLabel() {
  const money = useMoney()
  return (charge: BillingCharge) =>
    charge.status === 'partially_refunded'
      ? `Refunded ${money(charge.refunded, charge.currency)}`
      : PAYMENT_STATUS[charge.status].label
}
