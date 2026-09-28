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

/** "Refunded $20" for a partial refund, otherwise the status label ("Paid", "Failed"…). */
export function useChargeStatusLabel() {
  const money = useMoney()
  return (charge: BillingCharge) =>
    charge.status === 'partially_refunded'
      ? `Refunded ${money(charge.refunded, charge.currency)}`
      : PAYMENT_STATUS[charge.status].label
}
