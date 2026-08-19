'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'

export function PaymentSuccessCard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isSuccess = searchParams.get('payment') === 'success'
  const [dismissed, setDismissed] = useState(false)

  if (!isSuccess || dismissed) return null

  const handleContinue = () => {
    setDismissed(true)

    const params = new URLSearchParams(searchParams.toString())
    params.delete('payment')
    params.delete('session_id')

    const query = params.toString()
    const newPath = query ? `${pathname}?${query}` : pathname
    router.replace(newPath, { scroll: false })
  }

  return (
    <div className="mb-6 flex flex-col items-start gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:text-emerald-100">
      <div className="flex items-center gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <svg
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold">
            Payment Completed Successfully!
          </h3>
          <p className="text-sm opacity-90">
            Thank you for your purchase. Your account features and quota have
            been updated.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleContinue}
        className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
      >
        Continue to Dashboard
      </button>
    </div>
  )
}
