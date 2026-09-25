'use client'

import { Check } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxConfirmDialog } from '@/components/shared/fx-confirm-dialog'
import { FxField, FxInput, FxLabel } from '@/components/shared/fx-field'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
} from '@/components/shared/fx-sheet'
import { Sheet } from '@/components/ui/sheet'
import { env } from '@/config/env'

import { renameWorkspaceAction } from '../actions'

const APP_DOMAIN = env.NEXT_PUBLIC_APP_DOMAIN ?? 'yourdomain.com'

interface EditWorkspaceSheetProps {
  orgSlug: string
  currentName: string
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditWorkspaceSheet({
  orgSlug,
  currentName,
  slug,
  open,
  onOpenChange,
}: EditWorkspaceSheetProps) {
  const [name, setName] = useState(currentName)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const isDirty = name.trim() !== currentName

  const close = () => {
    setName(currentName)
    setShowDiscard(false)
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && isDirty) {
      setShowDiscard(true)
      return
    }
    if (!next) {
      close()
      return
    }
    onOpenChange(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    const result = await renameWorkspaceAction(orgSlug, name)
    setIsSubmitting(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('Workspace updated.')
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <FxSheetContent
        onOpenAutoFocus={(e) => {
          // Radix focuses the first input with its text selected; put the caret at the end instead.
          e.preventDefault()
          const input = nameRef.current
          if (!input) return
          input.focus()
          input.setSelectionRange(input.value.length, input.value.length)
        }}
      >
        <FxSheetHeader>
          <FxSheetTitle>Edit workspace</FxSheetTitle>
          <FxSheetDescription>
            The name everyone on the team sees.
          </FxSheetDescription>
        </FxSheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-1">
            <FxField>
              <FxLabel htmlFor="workspace-name">
                Workspace name <span className="text-destructive">*</span>
              </FxLabel>
              <FxInput
                ref={nameRef}
                id="workspace-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FxField>

            <FxField>
              <FxLabel htmlFor="workspace-url">Workspace URL</FxLabel>
              <FxInput
                id="workspace-url"
                value={`${APP_DOMAIN}/${slug}`}
                disabled
              />
            </FxField>

            <p className="text-muted-foreground text-xs">
              The URL is fixed — changing it would break every existing link and
              bookmark to this workspace.
            </p>
          </FxSheetBody>

          <FxSheetFooter>
            <FxButton
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </FxButton>
            <FxButton type="submit" disabled={isSubmitting} className="gap-1.5">
              <Check className="size-4" />
              {isSubmitting ? 'Saving…' : 'Save'}
            </FxButton>
          </FxSheetFooter>
        </form>
      </FxSheetContent>

      <FxConfirmDialog
        nested
        open={showDiscard}
        onOpenChange={setShowDiscard}
        destructive={false}
        title="Discard your changes?"
        description="Nothing is saved until you press Save - closing now loses what you edited."
        confirmLabel="Discard changes"
        onConfirm={close}
      />
    </Sheet>
  )
}
