import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center space-y-4 p-6 text-center">
      <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
        <FileQuestion className="text-muted-foreground h-8 w-8" />
      </div>

      <h1 className="text-4xl font-extrabold tracking-tight">
        404 - Page Not Found
      </h1>

      <p className="text-muted-foreground max-w-sm text-sm">
        The page you are looking for does not exist, has been moved, or the URL
        was mistyped.
      </p>

      <Button asChild>
        <Link href="/">Return Home</Link>
      </Button>
    </div>
  )
}
