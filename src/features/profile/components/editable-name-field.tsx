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
import { useRef, useState, useTransition } from 'react'
import { useController, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { updateFullName } from '../actions'
import { PROFILE } from '../data'
import { fullNameSchema, type FullNameInput } from '../schemas'

export function EditableNameField({
  fullName,
  onSaved,
}: {
  fullName: string | null
  onSaved: (fullName: string) => void
}) {
  const [editing, setEditing] = useState<boolean>(false)
  const [saved, setSaved] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const savedName = fullName ?? ''

  const form = useForm<FullNameInput>({
    resolver: zodResolver(fullNameSchema),
    mode: 'onTouched',
    defaultValues: { fullName: fullName ?? '' },
  })

  const { field, fieldState } = useController({
    control: form.control,
    name: 'fullName',
  })

  function beginEdit() {
    setError(null)
    setSaved(false)
    form.reset({ fullName: savedName })
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function cancelEdit() {
    form.reset({ fullName: savedName })
    setError(null)
    setEditing(false)
  }

  const save = form.handleSubmit(
    (values) => {
      setError(null)
      startTransition(async () => {
        const result = await updateFullName(values.fullName)
        if (!result.ok) {
          setError(result.error)
          toast.error(result.error)
          return
        }
        toast.success('Name updated successfully')
        onSaved(result.fullName)
        form.reset({ fullName: result.fullName })
        setEditing(false)
        setSaved(true)
      })
    },
    () => setError(null)
  )

  return (
    <FxField data-invalid={Boolean(fieldState.error) || undefined}>
      <FxLabel htmlFor="full-name" className="block leading-normal">
        {PROFILE.fields.name}
      </FxLabel>

      <FxInputGroup>
        <FxInputGroupInput
          id="full-name"
          inputSize="sm"
          readOnly={!editing}
          aria-invalid={Boolean(fieldState.error) || undefined}
          placeholder={PROFILE.noName}
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={(node) => {
            field.ref(node)
            inputRef.current = node
          }}
          onKeyDown={(event) => {
            if (!editing) return
            if (event.key === 'Enter') {
              event.preventDefault()
              save()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelEdit()
            }
          }}
        />

        <FxInputGroupAddon align="inline-end" className="gap-1 p-0 px-1.5">
          {editing ? (
            <>
              <FxButton
                type="button"
                className="text-success hover:text-success bg-transparent hover:bg-transparent"
                size="icon-sm"
                aria-label={PROFILE.edit.save}
                disabled={pending}
                onClick={() => void save()}
              >
                <NAV_ICONS.check strokeWidth={2.2} />
              </FxButton>
              <FxButton
                type="button"
                variant={'destructive'}
                size="icon-sm"
                aria-label={PROFILE.edit.cancel}
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
              size="icon-sm"
              aria-label={PROFILE.edit.start}
              className="text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent"
              onClick={beginEdit}
            >
              <NAV_ICONS.edit strokeWidth={1.8} />
            </FxButton>
          )}
        </FxInputGroupAddon>
      </FxInputGroup>

      <FxFieldError errors={[fieldState.error]} />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {saved && !editing && (
        <p role="status" className="text-success text-sm">
          {PROFILE.saved}
        </p>
      )}
    </FxField>
  )
}
