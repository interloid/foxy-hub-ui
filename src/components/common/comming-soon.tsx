import { Button } from '@/components/ui/button'
import { Construction } from 'lucide-react'
import Link from 'next/link'

interface ComingSoonProps {
  title?: string
  description?: string
}

export function ComingSoon({
  title = 'Coming Soon',
  description = 'This feature is currently under active development. Check back soon for updates.',
}: ComingSoonProps) {
  return (
    <div className="bg-background text-foreground flex h-[calc(100vh-4rem)] flex-col items-center justify-center space-y-4 p-6 text-center">
      <div className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center rounded-full">
        <Construction className="h-8 w-8" />
      </div>

      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>

      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>

      <Button asChild>
        <Link href="/">Return to Dashboard</Link>
      </Button>
    </div>
  )
}
