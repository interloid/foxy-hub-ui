'use client'

import { Button } from '@/components/ui/button'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            Something went wrong!
          </h2>
          <p className="text-muted-foreground text-sm">
            A critical error occurred. We apologize for the inconvenience.
          </p>
          <Button onClick={() => reset()} variant="default">
            Try again
          </Button>
        </div>
      </body>
    </html>
  )
}
