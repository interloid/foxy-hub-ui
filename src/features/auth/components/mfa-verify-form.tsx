'use client'

import {
  FxButton,
  FxField,
  FxFieldError,
  FxLabel,
} from '@/components/shared/fx'
import { MFA_CODE_LENGTH } from '@/lib/mfa'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { abandonMfaSignIn, verifyMfaSignIn } from '../mfa-actions'
import { MfaCodeInput } from './mfa-code-input'

export function MfaVerifyForm({ next }: { next: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [leaving, startLeaving] = useTransition()

  const submit = (value: string) => {
    if (value.length !== MFA_CODE_LENGTH || pending) return
    setError(null)
    startTransition(async () => {
      const result = await verifyMfaSignIn(value, next)
      if (!result.ok) {
        setError(result.error)
        setCode('')
        return
      }
      toast.success('Logged in successfully')
      router.replace(result.data.redirectTo)
    })
  }

  const useDifferentAccount = () => {
    startLeaving(async () => {
      await abandonMfaSignIn()
      router.replace('/sign-in')
    })
  }

  return (
    <form
      noValidate
      className="flex w-full flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit(code)
      }}
    >
      <FxField data-invalid={Boolean(error) || undefined}>
        <FxLabel htmlFor="mfa-code" className="block leading-normal">
          Authentication code
        </FxLabel>
        <MfaCodeInput
          id="mfa-code"
          value={code}
          onChange={(value) => {
            setCode(value)
            if (error) setError(null)
          }}
          onComplete={submit}
          disabled={pending || leaving}
          invalid={Boolean(error)}
          autoFocus
        />
        <FxFieldError errors={error ? [{ message: error }] : []} />
      </FxField>

      <FxButton
        type="submit"
        size="lg"
        className="w-full"
        disabled={code.length !== MFA_CODE_LENGTH || pending || leaving}
      >
        {pending ? 'Checking…' : 'Verify and continue'}
      </FxButton>

      <div className="text-muted-foreground flex flex-col gap-2 text-center text-sm">
        <p>
          Lost access to your authenticator app? Ask a workspace admin to reset
          two-factor authentication for you.
        </p>
        <button
          type="button"
          onClick={useDifferentAccount}
          disabled={pending || leaving}
          className="text-primary-accent mx-auto cursor-pointer font-semibold hover:underline disabled:opacity-50"
        >
          Use a different account
        </button>
      </div>
    </form>
  )
}
