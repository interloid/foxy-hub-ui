'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxConfirmDialog } from '@/components/shared/fx-confirm-dialog'
import {
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx-field'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetFooter,
  FxSheetHeader,
} from '@/components/shared/fx-sheet'
import { Sheet } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'

import { setClientStatusAction, updateClientAction } from '../actions'
import { clientStatusCopy } from '../lib/client-copy'
import { clientNameSchema, contactNameSchema, fieldError } from '../schemas'
import type { ClientCompanyRow } from '../types'

interface EditClientSheetProps {
  orgSlug: string
  client: ClientCompanyRow | null
  open: boolean
  canManage: boolean
  onOpenChange: (open: boolean) => void
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function EditClientSheet({ client, ...props }: EditClientSheetProps) {
  if (!client) return null
  return <EditClientSheetForm key={client.id} client={client} {...props} />
}

function EditClientSheetForm({
  orgSlug,
  client,
  canManage,
  open,
  onOpenChange,
}: EditClientSheetProps & { client: ClientCompanyRow }) {
  const [name, setName] = useState(client.name)
  const [contactName, setContactName] = useState(client.contactName ?? '')
  const [portal, setPortal] = useState(client.hasPortal)
  const [isSaving, setIsSaving] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [touched, setTouched] = useState({ name: false, contactName: false })
  const [showDiscard, setShowDiscard] = useState(false)
  const [showStatusConfirm, setShowStatusConfirm] = useState(false)

  const nameError = fieldError(clientNameSchema, name)
  const contactNameError = fieldError(contactNameSchema, contactName)
  const hasErrors = Boolean(nameError || contactNameError)

  const isDirty =
    name.trim() !== client.name ||
    contactName.trim() !== (client.contactName ?? '') ||
    portal !== client.hasPortal

  const close = () => {
    setShowDiscard(false)
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && isDirty) {
      setShowDiscard(true)
      return
    }
    onOpenChange(next)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, contactName: true })
    if (hasErrors) return

    setIsSaving(true)
    const result = await updateClientAction(orgSlug, client.id, {
      name,
      contactName,
      portal,
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(`${name.trim()} was updated.`)
    onOpenChange(false)
  }

  const handleToggleStatus = async () => {
    setIsTogglingStatus(true)
    const next = !client.isActive
    const result = await setClientStatusAction(orgSlug, client.id, next)
    setIsTogglingStatus(false)
    setShowStatusConfirm(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(`${client.name} was ${next ? 'reactivated' : 'deactivated'}.`)
    onOpenChange(false)
  }

  const statusCopy = clientStatusCopy(client.name, client.isActive)

  const projectLabel =
    client.projectCount === 1
      ? '1 project in the workspace'
      : `${client.projectCount} projects in the workspace`

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <FxSheetContent className="data-[side=right]:sm:max-w-165">
        <FxSheetHeader>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="text-brand-white bg-info flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            >
              {initialsOf(client.name)}
            </span>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate text-[15px] font-semibold">
                  {client.name}
                </span>
                <FxBadge
                  variant={client.isActive ? 'success' : 'secondary'}
                  size="sm"
                  shape="pill"
                >
                  {client.isActive ? 'Active' : 'Deactivated'}
                </FxBadge>
              </div>
              <p className="text-muted-foreground truncate text-xs">
                {client.contactEmail
                  ? `${client.contactEmail} · ${projectLabel}`
                  : projectLabel}
              </p>
            </div>
          </div>
        </FxSheetHeader>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-1">
            <FxField>
              <FxLabel htmlFor="edit-client-name">
                Client name <span className="text-destructive">*</span>
              </FxLabel>
              <FxInput
                id="edit-client-name"
                required
                disabled={!canManage}
                maxLength={80}
                value={name}
                aria-invalid={touched.name && nameError !== null}
                aria-describedby={
                  touched.name && nameError
                    ? 'edit-client-name-error'
                    : undefined
                }
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              />
              {touched.name && nameError && (
                <FxFieldError id="edit-client-name-error">
                  {nameError}
                </FxFieldError>
              )}
            </FxField>

            <FxField>
              <FxLabel htmlFor="edit-client-contact-name">
                Primary contact
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </FxLabel>
              <FxInput
                id="edit-client-contact-name"
                maxLength={80}
                disabled={!canManage}
                placeholder="Erik Lund"
                value={contactName}
                aria-invalid={touched.contactName && contactNameError !== null}
                aria-describedby={
                  touched.contactName && contactNameError
                    ? 'edit-client-contact-name-error'
                    : undefined
                }
                onChange={(e) => setContactName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, contactName: true }))}
              />
              {touched.contactName && contactNameError && (
                <FxFieldError id="edit-client-contact-name-error">
                  {contactNameError}
                </FxFieldError>
              )}
            </FxField>

            <label className="border-border bg-muted flex cursor-pointer items-center gap-3 rounded-lg border p-3">
              <Switch
                checked={portal}
                disabled={!canManage}
                onCheckedChange={setPortal}
                aria-label="Portal access"
              />
              <span className="space-y-0.5">
                <span className="text-foreground block text-[13px] font-medium">
                  Portal access
                </span>
                <span className="text-muted-foreground block text-xs">
                  Turning this off hides approvals and invoices from the contact
                  immediately.
                </span>
              </span>
            </label>
          </FxSheetBody>

          <FxSheetFooter className="justify-between">
            {canManage && (
              <FxButton
                type="button"
                variant="secondary"
                disabled={isTogglingStatus}
                onClick={() => setShowStatusConfirm(true)}
              >
                {client.isActive ? 'Deactivate' : 'Reactivate'}
              </FxButton>
            )}

            <div className="flex items-center gap-2">
              <FxButton
                type="button"
                variant="secondary"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </FxButton>
              {canManage && (
                <FxButton
                  type="submit"
                  disabled={isSaving || hasErrors || !isDirty}
                  className="gap-1.5"
                >
                  <Check className="size-4" />
                  {isSaving ? 'Saving…' : 'Save changes'}
                </FxButton>
              )}
            </div>
          </FxSheetFooter>
        </form>
      </FxSheetContent>

      <FxConfirmDialog
        nested
        open={showDiscard}
        onOpenChange={setShowDiscard}
        destructive={false}
        title="Discard your changes?"
        description="Nothing is saved until you press Save changes — closing now loses what you edited."
        confirmLabel="Discard changes"
        onConfirm={close}
      />

      <FxConfirmDialog
        nested
        open={showStatusConfirm}
        onOpenChange={setShowStatusConfirm}
        isPending={isTogglingStatus}
        onConfirm={handleToggleStatus}
        {...statusCopy}
      />
    </Sheet>
  )
}
