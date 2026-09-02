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
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
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

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  function beginEdit() {
    setSaved(false)
    form.reset({ fullName: savedName })
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function cancelEdit() {
    form.reset({ fullName: savedName })
    setEditing(false)
  }

  const handleSave = () => {
    startTransition(async () => {
      await form.handleSubmit(async (values) => {
        const result = await updateFullName(values.fullName)
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success('Name updated successfully')
        onSaved(result.fullName)
        form.reset({ fullName: result.fullName })
        setEditing(false)
        setSaved(true)
      })()
    })
  }

  return (
    <FxField data-invalid={Boolean(fieldState.error) || undefined}>
      <FxLabel htmlFor="full-name" className="block leading-normal">
        {PROFILE.fields.name}
      </FxLabel>

      <FxInputGroup>
        <FxInputGroupInput
          id="full-name"
          inputSize="sm"
          readOnly={!editing || pending}
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
              {/* Save / Loading Button */}
              <FxButton
                type="button"
                className="text-success hover:text-success bg-transparent hover:bg-transparent"
                variant={'ghost'}
                size="icon-sm"
                aria-label={PROFILE.edit.save}
                disabled={pending}
                onClick={handleSave}
              >
                {pending ? (
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                ) : (
                  <NAV_ICONS.check strokeWidth={2.2} />
                )}
              </FxButton>

              {/* Cancel Button */}
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
          ) : saved ? (
            /* Success Checkmark State */
            <div
              className="text-success flex size-7 items-center justify-center"
              aria-label={PROFILE.saved}
            >
              <NAV_ICONS.check strokeWidth={2.2} className="size-4" />
            </div>
          ) : (
            /* Default Edit Button */
            <FxButton
              type="button"
              variant={'ghost'}
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
    </FxField>
  )
}
