'use client'

import { NAV_ICONS } from '@/components/layout/nav-icons'
import {
  FxButton,
  FxField,
  FxFieldError,
  FxInputGroup,
  FxInputGroupAddon,
  FxInputGroupInput,
  FxLabel,
} from '@/components/shared/fx'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MailCheck } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'
import { useController, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { requestEmailChange } from '../actions'
import { PROFILE } from '../data'
import { emailSchema, type EmailInput } from '../schemas'

export function EditableEmailField({
  email,
  pendingEmail: initialPendingEmail,
  orgSlug,
}: {
  email: string | null
  pendingEmail: string | null
  orgSlug: string
}) {
  const [editing, setEditing] = useState<boolean>(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(
    initialPendingEmail
  )
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const currentEmail = email ?? ''

  const form = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    mode: 'onChange',
    defaultValues: { email: currentEmail },
  })

  const { field, fieldState } = useController({
    control: form.control,
    name: 'email',
  })
  const isEmailModified =
    field.value.trim().toLowerCase() !== currentEmail.trim().toLowerCase()
  const isCheckDisabled =
    !isEmailModified || Boolean(fieldState.error) || pending

  function beginEdit() {
    form.reset({ email: currentEmail })
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function cancelEdit() {
    form.reset({ email: currentEmail })
    setEditing(false)
  }

  const handleSave = () => {
    if (isCheckDisabled) return
    startTransition(async () => {
      await form.handleSubmit(async (values) => {
        const result = await requestEmailChange(values.email, orgSlug)
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(PROFILE.emailEdit.sent)
        setPendingEmail(result.pendingEmail)
        form.reset({ email: currentEmail })
        setEditing(false)
      })()
    })
  }

  return (
    <FxField data-invalid={Boolean(fieldState.error) || undefined}>
      <FxLabel htmlFor="email" className="block leading-normal">
        {PROFILE.fields.email}
      </FxLabel>

      <FxInputGroup className="has-disabled:opacity-100">
        <FxInputGroupInput
          id="email"
          type="email"
          inputSize="sm"
          autoComplete="email"
          readOnly={!editing || pending}
          aria-invalid={Boolean(fieldState.error) || undefined}
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={(node) => {
            field.ref(node)
            inputRef.current = node
          }}
          onKeyDown={(event) => {
            if (!editing || pending) return
            if (event.key === 'Enter') {
              event.preventDefault()
              handleSave()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelEdit()
            }
          }}
        />
        <FxInputGroupAddon
          align="inline-end"
          className="gap-1 border-0 p-0 px-1.5"
        >
          {editing ? (
            <>
              <FxButton
                type="button"
                className="text-success hover:text-success bg-transparent hover:bg-transparent disabled:pointer-events-none disabled:opacity-40 disabled:hover:bg-transparent"
                variant={'ghost'}
                size="icon-sm"
                aria-label={PROFILE.emailEdit.save}
                disabled={isCheckDisabled}
                onClick={handleSave}
              >
                {pending ? (
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                ) : (
                  <NAV_ICONS.check strokeWidth={2.2} />
                )}
              </FxButton>

              <FxButton
                type="button"
                variant={'destructive'}
                size="icon-sm"
                aria-label={PROFILE.emailEdit.cancel}
                className="bg-transparent hover:bg-transparent"
                disabled={pending}
                onClick={cancelEdit}
              >
                <NAV_ICONS.cancel strokeWidth={1.9} />
              </FxButton>
            </>
          ) : (
            <FxButton
              type="button"
              variant={'ghost'}
              size="icon-sm"
              aria-label={PROFILE.emailEdit.start}
              className="text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent"
              onClick={beginEdit}
            >
              <NAV_ICONS.edit strokeWidth={1.8} />
            </FxButton>
          )}
        </FxInputGroupAddon>
      </FxInputGroup>

      <FxFieldError errors={[fieldState.error]} />

      {pendingEmail && !editing && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <MailCheck className="text-primary mt-px size-3.5 shrink-0" />
          {PROFILE.emailEdit.pending(pendingEmail)}
        </p>
      )}
    </FxField>
  )
}
