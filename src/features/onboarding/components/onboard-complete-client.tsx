'use client'

import { startPlanCheckout } from '@/features/onboarding/actions'
import { useEffect, useRef, useState } from 'react'

interface OnboardCompleteClientProps {
  planName: string
  cycle: 'monthly' | 'yearly'
}

export function OnboardCompleteClient({
  planName,
  cycle,
}: OnboardCompleteClientProps) {
  const executedRef = useRef(false)
  const [message, setMessage] = useState('Redirecting to checkout...')

  useEffect(() => {
    if (executedRef.current) return
    executedRef.current = true

    async function processCheckout() {
      try {
        const result = await startPlanCheckout(planName, cycle)
        if (result.ok && result.data.url) {
          window.location.href = result.data.url
          return
        }
        setMessage('Could not start payment checkout.')
      } catch (err) {
        console.error('Checkout error:', err)
        setMessage('An error occurred during redirection.')
      }
    }

    processCheckout()
  }, [planName, cycle])

  return (
    <div className="border-border bg-card shadow-panel w-full max-w-110 rounded-2xl border p-7 text-center">
      <h1 className="mb-2 text-2xl font-semibold">Setting up payment...</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  )
}
