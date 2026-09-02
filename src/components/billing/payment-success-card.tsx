'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { FxButton } from '../shared/fx-button'

export function PaymentSuccessCard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isSuccess = searchParams.get('payment') === 'success'
  const [open, setOpen] = useState(true)

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
          <div className="bg-success/15 text-success flex size-12 items-center justify-center rounded-full">
            <CheckCircle2 className="size-6" />
          </div>
          <DialogTitle className="text-xl font-semibold">
            Payment Completed Successfully!
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Thank you for your purchase. Your workspace is active and upgraded.
            Pending teammate invitations have been queued for delivery.
          </DialogDescription>
        </DialogHeader>

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
