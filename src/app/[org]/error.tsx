'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const isNotFound = error.message.toLowerCase().includes('not found')
  const isUnauthorized = error.message.toLowerCase().includes('unauthorized')

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center p-6">
      <Card className="border-destructive/30 w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          <div className="bg-destructive/10 text-destructive mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">
            {isNotFound
              ? 'Workspace Not Found'
              : isUnauthorized
                ? 'Access Denied'
                : 'Failed to load workspace'}
          </CardTitle>
          <CardDescription>
            {error.message ||
              'An unexpected error occurred while loading this dashboard.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push('/')}>
            Go Home
          </Button>
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
