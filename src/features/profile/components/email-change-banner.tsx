'use client'

import { CheckCircle2, X, XCircle } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

import { PROFILE } from '../data'

export function EmailChangeBanner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const status = searchParams.get('email_change')
  if (status !== 'done' && status !== 'failed') return null

  const succeeded = status === 'done'
  const copy = PROFILE.emailChangeResult[status]
  const Icon = succeeded ? CheckCircle2 : XCircle

  const dismiss = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('email_change')

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div
      role="status"
      className={cn(
        'mb-5 flex items-start gap-3 rounded-xl border p-4',
        succeeded
          ? 'border-success/20 bg-success/10'
          : 'border-destructive/20 bg-destructive/10'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-5 shrink-0',
          succeeded ? 'text-success' : 'text-destructive'
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="text-foreground text-[13.5px] font-semibold">
          {copy.title}
        </p>
        <p className="text-muted-foreground text-[12.5px]">{copy.body}</p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded-md p-0.5 transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
