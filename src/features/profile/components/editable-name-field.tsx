'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useController, useForm } from 'react-hook-form'
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
  const [editing, setEditing] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement | null>(null)

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
          return
        }
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
                variant="ghost"
                size="icon-sm"
                aria-label={PROFILE.edit.save}
                disabled={pending}
                onClick={() => void save()}
              >
                <NAV_ICONS.check strokeWidth={2.2} />
              </FxButton>
              <FxButton
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={PROFILE.edit.cancel}
                disabled={pending}
                onClick={cancelEdit}
              >
                <NAV_ICONS.cancel strokeWidth={1.9} />
              </FxButton>
            </>
          ) : (
            <FxButton
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={PROFILE.edit.start}
              onClick={beginEdit}
            >
              <NAV_ICONS.edit strokeWidth={1.8} />
            </FxButton>
          )}
        </FxInputGroupAddon>
      </FxInputGroup>

      <FxFieldError errors={[fieldState.error]} />
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {saved && !editing ? (
        <p role="status" className="text-success text-sm">
          {PROFILE.saved}
        </p>
      ) : null}
    </FxField>
  )
}
