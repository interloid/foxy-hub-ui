'use client'

import { AlertTriangle, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import {
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx-field'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
} from '@/components/shared/fx-sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'

import { createClientAction } from '../actions'
import { NETWORK_ERROR } from '../lib/network-error'
import {
  clientNameSchema,
  contactEmailSchema,
  contactNameSchema,
  fieldError,
} from '../schemas'

const NO_PROJECT = 'none'

interface NewClientSheetProps {
  orgSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewClientSheet({
  orgSlug,
  open,
  onOpenChange,
}: NewClientSheetProps) {
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [portal, setPortal] = useState(true)

  const [invite, setInvite] = useState(false)
  const [projectId, setProjectId] = useState(NO_PROJECT)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touched, setTouched] = useState({
    name: false,
    contactName: false,
    contactEmail: false,
  })
  const [showDiscard, setShowDiscard] = useState(false)

  const touch = (field: keyof typeof touched) =>
    setTouched((prev) => ({ ...prev, [field]: true }))

  const nameError = fieldError(clientNameSchema, name)
  const contactNameError = fieldError(contactNameSchema, contactName)
  const contactEmailError = fieldError(contactEmailSchema, contactEmail)
  const hasErrors = Boolean(nameError || contactNameError || contactEmailError)

  const isDirty =
    name.trim() !== '' ||
    contactName.trim() !== '' ||
    contactEmail.trim() !== '' ||
    projectId !== NO_PROJECT ||
    !portal

  const resetForm = () => {
    setName('')
    setContactName('')
    setContactEmail('')
    setPortal(true)
    setInvite(false)
    setProjectId(NO_PROJECT)
    setTouched({ name: false, contactName: false, contactEmail: false })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && isDirty) {
      setShowDiscard(true)
      return
    }
    if (!next) resetForm()
    onOpenChange(next)
  }

  const discardAndClose = () => {
    resetForm()
    setShowDiscard(false)
    onOpenChange(false)
  }

  const handleEmailChange = (value: string) => {
    setContactEmail(value)
    setInvite(portal && value.trim() !== '')
  }

  const handlePortalChange = (next: boolean) => {
    setPortal(next)
    setInvite(next && contactEmail.trim() !== '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, contactName: true, contactEmail: true })
    if (hasErrors) return

    setIsSubmitting(true)
    let result
    try {
      result = await createClientAction(orgSlug, {
        name,
        contactName,
        contactEmail,
        portal,
        invite: invite && portal && contactEmail.trim() !== '',
        projectId: projectId === NO_PROJECT ? undefined : projectId,
      })
    } catch {
      toast.error(NETWORK_ERROR)
      return
    } finally {
      setIsSubmitting(false)
    }

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    const label = name.trim()
    const verb = result.data.reactivated ? 'was reactivated' : 'was added'

    if (result.data.inviteError) {
      toast.error(`${label} ${verb}, but ${result.data.inviteError}`)
    } else if (result.data.invited) {
      toast.success(`${label} ${verb} and a portal invite was sent.`)
    } else {
      // Only when portal access is off — the contact email is required, and with portal
      // on an invite is always sent. There is no "send invite" button to point at.
      toast.success(
        `${label} ${verb}. Portal access is off, so no invite was sent.`
      )
    }

    resetForm()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <FxSheetContent className="data-[side=right]:md:max-w-165">
        <FxSheetHeader>
          <FxSheetTitle>New client</FxSheetTitle>
          <FxSheetDescription>
            A company you bill. The primary contact is who gets portal access
            and sees invoices.
          </FxSheetDescription>
        </FxSheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-2">
            <FxField>
              <FxLabel htmlFor="new-client-name">
                Client name <span className="text-destructive">*</span>
              </FxLabel>
              <FxInput
                id="new-client-name"
                required
                placeholder="Nordwave Coffee"
                value={name}
                aria-invalid={touched.name && nameError !== null}
                aria-describedby={
                  touched.name && nameError
                    ? 'new-client-name-error'
                    : undefined
                }
                onChange={(e) => setName(e.target.value)}
                onBlur={() => touch('name')}
              />
              {touched.name && nameError && (
                <FxFieldError id="new-client-name-error">
                  {nameError}
                </FxFieldError>
              )}
            </FxField>

            <div className="md:flex md:gap-4">
              <FxField>
                <FxLabel htmlFor="new-client-contact-name">
                  Primary contact{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FxLabel>
                <FxInput
                  id="new-client-contact-name"
                  maxLength={80}
                  placeholder="Erik Lund"
                  value={contactName}
                  aria-invalid={
                    touched.contactName && contactNameError !== null
                  }
                  aria-describedby={
                    touched.contactName && contactNameError
                      ? 'new-client-contact-name-error'
                      : undefined
                  }
                  onChange={(e) => setContactName(e.target.value)}
                  onBlur={() => touch('contactName')}
                />
                {touched.contactName && contactNameError && (
                  <FxFieldError id="new-client-contact-name-error">
                    {contactNameError}
                  </FxFieldError>
                )}
              </FxField>

              <FxField>
                <FxLabel htmlFor="new-client-contact-email">
                  Contact email <span className="text-destructive">*</span>
                </FxLabel>
                <FxInput
                  id="new-client-contact-email"
                  type="email"
                  required
                  placeholder="erik@nordwave.com"
                  value={contactEmail}
                  aria-invalid={
                    touched.contactEmail && contactEmailError !== null
                  }
                  aria-describedby={
                    touched.contactEmail && contactEmailError
                      ? 'new-client-contact-email-error'
                      : undefined
                  }
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => touch('contactEmail')}
                />
                {touched.contactEmail && contactEmailError && (
                  <FxFieldError id="new-client-contact-email-error">
                    {contactEmailError}
                  </FxFieldError>
                )}
              </FxField>
            </div>

            <label className="border-border justify- bg-muted flex cursor-pointer items-center gap-3 rounded-lg border p-3">
              <Switch
                checked={portal}
                className="[&>span]:data-[state=checked]:bg-brand-white [&>span]:data-[state=unchecked]:bg-brand-white"
                onCheckedChange={handlePortalChange}
                aria-label="Portal access"
              />
              <span className="space-y-1">
                <span className="text-foreground block text-[13px] font-medium">
                  Give the contact portal access
                </span>
                <span className="text-muted-foreground block text-xs">
                  They see approvals, invoices and shared updates nothing
                  internal.
                </span>
              </span>
            </label>
          </FxSheetBody>

          <FxSheetFooter className="flex justify-end">
            <FxButton
              type="button"
              variant="secondary"
              onClick={discardAndClose}
              className="bg-muted"
            >
              Cancel
            </FxButton>
            <FxButton
              type="submit"
              disabled={isSubmitting || hasErrors}
              className="gap-1.5"
            >
              <Check className="size-4" />
              {isSubmitting ? 'Creating…' : 'Create client'}
            </FxButton>
          </FxSheetFooter>
        </form>
      </FxSheetContent>

      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent className="z-60">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-destructive-subtle text-destructive flex size-9 shrink-0 items-center justify-center rounded-lg"
              >
                <AlertTriangle className="size-4.5" />
              </span>
              <div className="space-y-1">
                <AlertDialogTitle className="text-[15.5px]">
                  Discard this client?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[13px]">
                  Nothing is saved until you press Add client - closing now
                  loses what you typed.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="bg-muted text-[13px]">
            <AlertDialogCancel size="lg" className="bg-card cursor-pointer p-4">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              size="lg"
              variant="default"
              onClick={discardAndClose}
              className="cursor-pointer p-4"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
