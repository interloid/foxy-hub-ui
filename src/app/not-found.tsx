import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center space-y-4 p-6 text-center">
      <h2 className="text-3xl font-extrabold tracking-tight">
        404 - Page Not Found
      </h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild variant="default">
        <Link href="/">Return Home</Link>
      </Button>
    </div>
  )
}
