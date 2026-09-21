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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'

import { createClientAction } from '../actions'
import type { ProjectOption } from '../types'

const NO_PROJECT = 'none'

interface NewClientSheetProps {
  orgSlug: string
  projectOptions: ProjectOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewClientSheet({
  orgSlug,
  projectOptions,
  open,
  onOpenChange,
}: NewClientSheetProps) {
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [invite, setInvite] = useState(false)
  const [projectId, setProjectId] = useState(NO_PROJECT)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Closing discards the draft, so reopening never shows someone else's half-typed client.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName('')
      setContactName('')
      setContactEmail('')
      setInvite(false)
      setProjectId(NO_PROJECT)
    }
    onOpenChange(next)
  }

  const handleEmailChange = (value: string) => {
    setContactEmail(value)
    if (!value.trim()) setInvite(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    const result = await createClientAction(orgSlug, {
      name,
      contactName,
      contactEmail,
      invite,
      projectId: projectId === NO_PROJECT ? undefined : projectId,
    })
    setIsSubmitting(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    const label = name.trim()
    // A name you had deactivated comes back as the same company, so say so rather than
    // claim it was added fresh.
    const verb = result.data.reactivated ? 'was reactivated' : 'was added'

    if (result.data.inviteError) {
      toast.warning(`${label} ${verb}, but ${result.data.inviteError}`)
    } else if (result.data.invited) {
      toast.success(`${label} ${verb} and a portal invite was sent.`)
    } else {
      toast.success(
        result.data.reactivated
          ? `${label} was reactivated.`
          : `${label} was added to your clients.`
      )
    }

    handleOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <FxSheetContent>
        <FxSheetHeader>
          <FxSheetTitle>Add a client</FxSheetTitle>
          <FxSheetDescription>
            The company you bill for, and the person you deal with there.
            Clients count against your plan.
          </FxSheetDescription>
        </FxSheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-1">
            <FxField>
              <FxLabel htmlFor="new-client-name">
                Client name <span className="text-destructive">*</span>
              </FxLabel>
              <FxInput
                id="new-client-name"
                required
                placeholder="Nordwave Coffee"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FxField>

            <FxField>
              <FxLabel htmlFor="new-client-contact-name">
                Primary contact
              </FxLabel>
              <FxInput
                id="new-client-contact-name"
                placeholder="Erik Lund"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </FxField>

            <FxField>
              <FxLabel htmlFor="new-client-contact-email">
                Contact email
              </FxLabel>
              <FxInput
                id="new-client-contact-email"
                type="email"
                placeholder="erik@nordwave.com"
                value={contactEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
              />
            </FxField>

            <label className="border-border flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
              <Checkbox
                checked={invite}
                onCheckedChange={(checked) => setInvite(checked === true)}
                disabled={!contactEmail.trim()}
                className="mt-0.5 cursor-pointer"
              />
              <span className="space-y-1">
                <span className="text-foreground block text-[13px] font-medium">
                  Email them a portal invite
                </span>
                <span className="text-muted-foreground block text-xs">
                  {contactEmail.trim()
                    ? 'They set a password and see only what you share with them.'
                    : 'Add a contact email first.'}
                </span>
              </span>
            </label>

            {invite && (
              <FxField className="pt-1 pb-2">
                <FxLabel htmlFor="new-client-project">
                  Project access{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FxLabel>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger
                    id="new-client-project"
                    className="h-9! w-full cursor-pointer p-2"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    sideOffset={6}
                    className="p-1"
                  >
                    <SelectItem
                      value={NO_PROJECT}
                      className="cursor-pointer p-2"
                    >
                      No project yet
                    </SelectItem>
                    {projectOptions.map((project) => (
                      <SelectItem
                        key={project.id}
                        value={project.id}
                        className="cursor-pointer p-2"
                      >
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FxField>
            )}

            <p className="text-muted-foreground text-xs">
              Without a project their portal stays empty until you point one at
              them.
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
              {isSubmitting ? 'Adding…' : 'Add client'}
            </FxButton>
          </FxSheetFooter>
        </form>
      </FxSheetContent>
    </Sheet>
  )
}
