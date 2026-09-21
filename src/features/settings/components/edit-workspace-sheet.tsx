'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
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

/** Workspaces are a path on one domain, not a subdomain each — `foxyhub.app/interloid`. */
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

  const handleOpenChange = (next: boolean) => {
    if (!next) setName(currentName)
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
      <FxSheetContent>
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
    </Sheet>
  )
}
