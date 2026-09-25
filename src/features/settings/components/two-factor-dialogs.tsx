'use client'

import { Copy, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxField, FxFieldError, FxLabel } from '@/components/shared/fx-field'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MfaCodeInput } from '@/features/auth/components/mfa-code-input'
import {
  cancelTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  startTotpEnrollment,
  type TotpEnrollment,
} from '@/features/auth/mfa-actions'
import { MFA_CODE_LENGTH } from '@/lib/mfa'
import { cn } from '@/lib/utils'

const STEPS = ['Scan the code', 'Confirm'] as const

function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-110"
        showCloseButton={false}
      >
        {/* Own close button: the built-in one is a ghost button with a hover fill. Closing
            goes through onOpenChange, so each dialog's cleanup still runs. */}
        <DialogClose
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground absolute top-3.5 right-3.5 flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors"
        >
          <X className="size-4" />
        </DialogClose>
        <div className="border-border space-y-2 border-b px-5 py-4 pr-12">
          <DialogTitle className="text-foreground text-[15.5px] font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-muted-foreground text-[13px]">
              {description}
            </div>
          </DialogDescription>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-4">
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function EnableTwoFactorDialog({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnabled: () => void
}) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const completed = useRef(false)
  // One enrollment per opening. A ref, not effect cleanup: Strict Mode runs effects twice
  // in development, and each run would otherwise create its own factor.
  const requested = useRef(false)

  useEffect(() => {
    if (!open) {
      requested.current = false
      return
    }
    if (requested.current) return
    requested.current = true
    completed.current = false

    startTransition(async () => {
      const result = await startTotpEnrollment()
      // Closed while Supabase was still creating it — remove it again.
      if (!requested.current) {
        if (result.ok) void cancelTotpEnrollment(result.data.factorId)
        return
      }
      if (!result.ok) {
        toast.error(result.error)
        requested.current = false
        onOpenChange(false)
        return
      }
      setEnrollment(result.data)
    })
  }, [open, onOpenChange])

  // Reset when the dialog OPENS, not when it closes: clearing on close emptied the body
  // (the QR code turned into the loader) while the close animation was still playing.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEnrollment(null)
      setStep(1)
      setCode('')
      setError(null)
    }
  }

  const close = () => {
    requested.current = false
    if (enrollment && !completed.current) {
      void cancelTotpEnrollment(enrollment.factorId)
    }
    onOpenChange(false)
  }

  const confirm = (value: string) => {
    if (!enrollment || value.length !== MFA_CODE_LENGTH || pending) return
    setError(null)
    startTransition(async () => {
      const result = await confirmTotpEnrollment(enrollment.factorId, value)
      if (!result.ok) {
        setError(result.error)
        setCode('')
        return
      }
      completed.current = true
      toast.success('Two-factor authentication is on.')
      onEnabled()
      close()
    })
  }

  const copySecret = async () => {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      toast.success('Setup key copied.')
    } catch {
      toast.error('Could not copy — select the key and copy it instead.')
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) close()
      }}
      title="Turn on two-factor authentication"
      description={
        <ol className="flex items-center gap-2 text-xs font-semibold">
          {STEPS.map((label, index) => {
            const number = index + 1
            const active = number === step
            const done = number < step
            return (
              <li key={label} className="flex items-center gap-2">
                {index > 0 && (
                  <span aria-hidden="true" className="bg-border h-px w-8" />
                )}
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[11px]',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : done
                        ? 'bg-success text-brand-white'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {number}
                </span>
                <span
                  aria-current={active ? 'step' : undefined}
                  className={
                    active ? 'text-primary-accent' : 'text-muted-foreground'
                  }
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ol>
      }
      footer={
        step === 1 ? (
          <>
            <FxButton
              type="button"
              variant="secondary"
              size="lg"
              onClick={close}
            >
              Cancel
            </FxButton>
            <FxButton
              type="button"
              size="lg"
              disabled={!enrollment}
              onClick={() => setStep(2)}
            >
              Next
            </FxButton>
          </>
        ) : (
          <>
            <FxButton
              type="button"
              variant="secondary"
              size="lg"
              disabled={pending}
              onClick={() => {
                setStep(1)
                setError(null)
              }}
            >
              Back
            </FxButton>
            <FxButton
              type="button"
              size="lg"
              disabled={code.length !== MFA_CODE_LENGTH || pending}
              onClick={() => confirm(code)}
            >
              {pending ? 'Checking…' : 'Turn on'}
            </FxButton>
          </>
        )
      }
    >
      {step === 1 ? (
        enrollment ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-muted-foreground text-sm">
              Scan this with an authenticator app — Google Authenticator,
              Microsoft Authenticator, 1Password or similar.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- an SVG data URL from Supabase, not an optimisable asset */}
            <img
              src={enrollment.qrCode}
              alt="QR code for your authenticator app"
              className="bg-brand-white size-44 rounded-lg p-2"
            />
            <div className="w-full space-y-1.5">
              <p className="text-subtle-foreground text-xs">
                Can&apos;t scan? Enter this setup key instead:
              </p>
              <div className="border-border bg-muted flex items-center gap-2 rounded-lg border px-3 py-2">
                <code className="text-foreground min-w-0 flex-1 font-mono text-xs break-all select-all">
                  {enrollment.secret}
                </code>
                <FxButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy setup key"
                  onClick={copySecret}
                  className="bg-brand-white hover:bg-brand-white"
                >
                  <Copy className="size-4" />
                </FxButton>
              </div>
            </div>
            <p className="border-border bg-muted/60 text-muted-foreground w-full rounded-lg border px-3 py-2 text-left text-xs">
              Set up Foxy HUB before? Delete the old entry in your authenticator
              app first — its codes no longer work.
            </p>
          </div>
        ) : (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        )
      ) : (
        <FxField data-invalid={Boolean(error) || undefined}>
          <FxLabel htmlFor="mfa-enroll-code" className="block leading-normal">
            Enter the 6-digit code your app shows
          </FxLabel>
          <MfaCodeInput
            id="mfa-enroll-code"
            value={code}
            onChange={(value) => {
              setCode(value)
              if (error) setError(null)
            }}
            onComplete={confirm}
            disabled={pending}
            invalid={Boolean(error)}
            autoFocus
            className="border-none! shadow-none ring-0! outline-none!"
          />
          <FxFieldError errors={error ? [{ message: error }] : []} />
        </FxField>
      )}
    </DialogShell>
  )
}

/** Turning 2FA off asks for a current code — an unattended laptop cannot do it. */
export function DisableTwoFactorDialog({
  open,
  onOpenChange,
  onDisabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDisabled: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Reset on open so the code field does not visibly empty during the close animation.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCode('')
      setError(null)
    }
  }

  const close = () => onOpenChange(false)

  const disable = (value: string) => {
    if (value.length !== MFA_CODE_LENGTH || pending) return
    setError(null)
    startTransition(async () => {
      const result = await disableTotp(value)
      if (!result.ok) {
        setError(result.error)
        setCode('')
        return
      }
      toast.success('Two-factor authentication is off.')
      onDisabled()
      close()
    })
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) close()
      }}
      title="Turn off two-factor authentication"
      description="Your account will only need your password to sign in. Enter a current code from your authenticator app to confirm."
      footer={
        <>
          <FxButton
            type="button"
            variant="secondary"
            size="lg"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </FxButton>
          <FxButton
            type="button"
            variant="destructive"
            size="lg"
            disabled={code.length !== MFA_CODE_LENGTH || pending}
            onClick={() => disable(code)}
          >
            {pending ? 'Checking…' : 'Turn off'}
          </FxButton>
        </>
      }
    >
      <FxField data-invalid={Boolean(error) || undefined}>
        <FxLabel htmlFor="mfa-disable-code" className="block leading-normal">
          Authentication code
        </FxLabel>
        <MfaCodeInput
          id="mfa-disable-code"
          value={code}
          onChange={(value) => {
            setCode(value)
            if (error) setError(null)
          }}
          onComplete={disable}
          disabled={pending}
          invalid={Boolean(error)}
          autoFocus
        />
        <FxFieldError errors={error ? [{ message: error }] : []} />
      </FxField>
    </DialogShell>
  )
}
