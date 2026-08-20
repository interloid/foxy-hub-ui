import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function ComingSoon() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center space-y-4 p-6 text-center">
      <h2 className="text-3xl font-extrabold tracking-tight">Coming Soon</h2>

      <p className="text-muted-foreground max-w-sm text-sm">
        This page is currently under development. Please check back soon.
      </p>

      <Button asChild>
        <Link href="/">Return to Dashboard</Link>
      </Button>
    </div>
  )
}
