'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { redeemPendingInvites } from '@/features/onboarding/actions'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FxButton } from '../shared/fx-button'

export function PaymentSuccessCard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isSuccess = searchParams.get('payment') === 'success'
  const [open, setOpen] = useState(true)

  const [isLoading, setIsLoading] = useState(true)
  const [sentNote, setSentNote] = useState<string | null>(null)
  const [failedNote, setFailedNote] = useState<string | null>(null)

  const executedRef = useRef(false)

  useEffect(() => {
    if (!isSuccess || executedRef.current) return
    executedRef.current = true

    async function processInvites() {
      try {
        const invites = await redeemPendingInvites()
        if (invites.ok) {
          if (invites.data.emailed > 0 || invites.data.created > 0) {
            const count = invites.data.emailed || invites.data.created
            setSentNote(`Invited ${count} teammate${count === 1 ? '' : 's'}.`)
          }
          if (invites.data.failed.length > 0) {
            setFailedNote(
              `Could not invite: ${invites.data.failed.join(', ')} because the user is already a member of another organization.`
            )
          }
        }
      } catch (err) {
        console.error('Failed to redeem invites after payment:', err)
        setFailedNote('Could not automatically send pending invitations.')
      } finally {
        setIsLoading(false)
      }
    }

    processInvites()
  }, [isSuccess])

  if (!isSuccess) return null

  const handleClose = () => {
    setOpen(false)

    const params = new URLSearchParams(searchParams.toString())
    params.delete('payment')
    params.delete('session_id')

    const query = params.toString()
    const newPath = query ? `${pathname}?${query}` : pathname
    router.replace(newPath, { scroll: false })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-col items-center gap-3 text-center sm:text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-6" />
          </div>
          <DialogTitle className="text-xl font-semibold">
            Payment Completed Successfully!
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Thank you for your purchase. Your workspace is active and upgraded.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex min-h-[24px] items-center justify-center text-center text-sm">
          {isLoading ? (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Sending invitations...
            </p>
          ) : (
            <>
              {sentNote && (
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  {sentNote}
                </p>
              )}
              {failedNote && (
                <p className="text-destructive mt-1 font-medium">
                  {failedNote}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <FxButton
            onClick={handleClose}
            className="w-full focus:outline-none focus-visible:ring-0 sm:w-auto"
            variant="default"
          >
            Continue
          </FxButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
