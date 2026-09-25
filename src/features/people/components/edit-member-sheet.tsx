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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { isAdminRole, roleLabel, type UserRole } from '@/lib/role'

import {
  deactivateMembershipAction,
  makePrimaryAdminAction,
  reactivateMembershipAction,
  resetMemberMfaAction,
  updateMemberAction,
} from '../actions'
import {
  canDeactivateMember,
  canReactivateMember,
} from '../lib/can-deactivate-member'
import { memberReactivateCopy } from '../lib/client-copy'
import { NETWORK_ERROR } from '../lib/network-error'
import { fieldError, fullNameSchema, jobTitleSchema } from '../schemas'
import type { PersonRow } from '../types'

const ROLE_CHOICES: UserRole[] = ['admin', 'manager', 'contributor']

interface EditMemberSheetProps {
  orgSlug: string
  member: PersonRow | null
  viewerRole: UserRole | null
  viewerId: string | null
  open: boolean
  canManage: boolean
  onOpenChange: (open: boolean) => void
}

export function EditMemberSheet({ member, ...props }: EditMemberSheetProps) {
  if (!member) return null
  return (
    <EditMemberSheetForm key={member.membershipId} member={member} {...props} />
  )
}

function EditMemberSheetForm({
  orgSlug,
  member,
  viewerRole,
  viewerId,
  open,
  canManage,
  onOpenChange,
}: EditMemberSheetProps & { member: PersonRow }) {
  // Edits the stored name (empty when there is none), never the display placeholder.
  const [fullName, setFullName] = useState(member.savedName ?? '')
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? '')
  const [role, setRole] = useState<UserRole>(member.role)
  const [isSaving, setIsSaving] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [touched, setTouched] = useState({ fullName: false, jobTitle: false })
  const [showDiscard, setShowDiscard] = useState(false)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false)
  const [showPromote, setShowPromote] = useState(false)
  const [showResetMfa, setShowResetMfa] = useState(false)

  const isPrimary = member.role === 'primary_admin'
  const showDeactivate = canDeactivateMember(viewerRole, viewerId, member)
  const showReactivate = canReactivateMember(viewerRole, viewerId, member)
  const nameError = fieldError(fullNameSchema, fullName)
  const jobTitleError = fieldError(jobTitleSchema, jobTitle)
  const hasErrors = Boolean(nameError || jobTitleError)

  const isDirty =
    fullName.trim() !== (member.savedName ?? '') ||
    jobTitle.trim() !== (member.jobTitle ?? '') ||
    role !== member.role

  // Lost-authenticator reset: admins only, never yourself, and the primary admin's own
  // factors only by the primary admin (who is then resetting themselves — so never here).
  const canResetMfa =
    isAdminRole(viewerRole) &&
    member.isActive &&
    member.userId !== viewerId &&
    !isPrimary

  const canPromote =
    viewerRole === 'primary_admin' && member.role === 'admin' && member.isActive

  // The form stays mounted while the sheet is closed, so discarding puts the saved
  // values back — otherwise reopening this person shows the discarded edits.
  const close = () => {
    setFullName(member.savedName ?? '')
    setJobTitle(member.jobTitle ?? '')
    setRole(member.role)
    setTouched({ fullName: false, jobTitle: false })
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
    setTouched({ fullName: true, jobTitle: true })
    if (hasErrors) return

    setIsSaving(true)
    // Only send the name when it changed. '' becomes null in the action and the
    // database keeps the current name — so an unchanged or empty field writes nothing.
    const nameChanged = fullName.trim() !== (member.savedName ?? '')
    let result
    try {
      result = await updateMemberAction(orgSlug, member.membershipId, {
        fullName: nameChanged ? fullName : '',
        jobTitle,
        role,
      })
    } catch {
      toast.error(NETWORK_ERROR)
      return
    } finally {
      setIsSaving(false)
    }

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${fullName.trim() || member.fullName} was updated.`)
    onOpenChange(false)
  }

  const runAction = async (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    success: string
  ) => {
    setIsWorking(true)
    let result
    try {
      result = await fn()
    } catch {
      toast.error(NETWORK_ERROR)
      return
    } finally {
      setIsWorking(false)
      setShowDeactivateConfirm(false)
      setShowReactivateConfirm(false)
      setShowPromote(false)
      setShowResetMfa(false)
    }
    if (!result.ok) {
      toast.error(result.error ?? 'Something went wrong.')
      return
    }
    toast.success(success)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <FxSheetContent className="data-[side=right]:sm:max-w-140">
        <FxSheetHeader>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-foreground truncate text-[15px] font-semibold">
                {member.fullName}
              </span>
              <FxBadge
                dot
                shape="pill"
                size="sm"
                className={
                  member.isActive
                    ? 'bg-success-subtle text-success'
                    : 'bg-muted text-muted-foreground'
                }
              >
                {member.isActive ? 'Active' : 'Deactivated'}
              </FxBadge>
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {member.email ?? 'No email on file'} · {roleLabel(member.role)}
            </p>
          </div>
        </FxSheetHeader>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-1">
            <FxField>
              <FxLabel htmlFor="edit-member-name">
                Full name
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </FxLabel>
              <FxInput
                id="edit-member-name"
                maxLength={80}
                disabled={!canManage}
                value={fullName}
                placeholder="Unnamed teammate"
                aria-invalid={touched.fullName && nameError !== null}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, fullName: true }))}
              />
              {touched.fullName && nameError && (
                <FxFieldError>{nameError}</FxFieldError>
              )}
            </FxField>

            <FxField>
              <FxLabel htmlFor="edit-member-job-title">
                Job title{' '}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </FxLabel>
              <FxInput
                id="edit-member-job-title"
                maxLength={60}
                disabled={!canManage}
                placeholder="Product Designer"
                value={jobTitle}
                aria-invalid={touched.jobTitle && jobTitleError !== null}
                onChange={(e) => setJobTitle(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, jobTitle: true }))}
              />
              {touched.jobTitle && jobTitleError && (
                <FxFieldError>{jobTitleError}</FxFieldError>
              )}
            </FxField>

            {canManage && (
              <FxField className="pb-2">
                <FxLabel htmlFor="edit-member-role">Role</FxLabel>
                {isPrimary ? (
                  <p className="text-muted-foreground border-border rounded-lg border p-3 text-xs">
                    The primary admin&apos;s role cannot be changed here. Hand
                    it to another admin from their row instead — the workspace
                    always has exactly one.
                  </p>
                ) : (
                  <Select
                    value={role}
                    onValueChange={(v) => setRole(v as UserRole)}
                  >
                    <SelectTrigger
                      id="edit-member-role"
                      className="bg-muted border-border text-md h-11! w-full cursor-pointer p-2"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      align="start"
                      sideOffset={6}
                      className="p-1"
                    >
                      {ROLE_CHOICES.map((r) => (
                        <SelectItem
                          key={r}
                          value={r}
                          className="cursor-pointer p-2.5"
                        >
                          {roleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FxField>
            )}
          </FxSheetBody>

          <FxSheetFooter className="justify-between">
            <div className="flex items-center gap-2">
              {showDeactivate && canManage && (
                <FxButton
                  type="button"
                  variant="secondary"
                  className="hover:text-destructive hover:border-destructive hover:bg-transparent"

                  disabled={isWorking}
                  onClick={() => setShowDeactivateConfirm(true)}
                >
                  Deactivate
                </FxButton>
              )}

              {showReactivate && canManage && (
                <FxButton
                  type="button"
                  variant="secondary"
                  className="hover:text-success hover:border-success hover:bg-transparent"
                  disabled={isWorking}
                  onClick={() => setShowReactivateConfirm(true)}
                >
                  Reactivate
                </FxButton>
              )}

              {canResetMfa && (
                <FxButton
                  type="button"
                  variant="secondary"
                  disabled={isWorking}
                  title="For when they have lost their authenticator app."
                  onClick={() => setShowResetMfa(true)}
                >
                  Reset 2FA
                </FxButton>
              )}

              {canPromote && (
                <FxButton
                  type="button"
                  variant="secondary"
                  disabled={isWorking}
                  title="You become an admin and they take over billing, ownership and workspace settings."
                  onClick={() => setShowPromote(true)}
                  className="gap-1.5"
                >
                  Make primary admin
                </FxButton>
              )}
            </div>
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
        description="Nothing is saved until you press Save changes closing now loses what you edited."
        confirmLabel="Discard changes"
        onConfirm={close}
      />

      <FxConfirmDialog
        nested
        open={showDeactivateConfirm}
        onOpenChange={setShowDeactivateConfirm}
        destructive={true}
        isPending={isWorking}
        title={`Deactivate ${member.fullName}?`}
        description="This removes their access and frees the seat. Every timesheet, invoice and comment they left stays intact."
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        onConfirm={() =>
          runAction(
            () => deactivateMembershipAction(orgSlug, member.membershipId),
            `${member.fullName} was deactivated.`
          )
        }
      />

      <FxConfirmDialog
        nested
        open={showReactivateConfirm}
        onOpenChange={setShowReactivateConfirm}
        isPending={isWorking}
        {...memberReactivateCopy(member.fullName)}
        onConfirm={() =>
          runAction(
            () => reactivateMembershipAction(orgSlug, member.membershipId),
            `${member.fullName} was reactivated.`
          )
        }
      />

      <FxConfirmDialog
        nested
        open={showResetMfa}
        onOpenChange={setShowResetMfa}
        destructive={true}
        isPending={isWorking}
        title={`Reset two-factor authentication for ${member.fullName}?`}
        description="Use this only when they have lost their authenticator app and you have confirmed it is really them. They will sign in with just their password until they turn two-factor on again."
        confirmLabel="Reset 2FA"
        pendingLabel="Resetting…"
        onConfirm={() =>
          runAction(
            () => resetMemberMfaAction(orgSlug, member.membershipId),
            `Two-factor authentication was reset for ${member.fullName}.`
          )
        }
      />

      <FxConfirmDialog
        nested
        destructive={false}
        open={showPromote}
        onOpenChange={setShowPromote}
        isPending={isWorking}
        title={`Make ${member.fullName} the primary admin?`}
        description="They take over billing, workspace settings and ownership. You become an admin only the new primary admin can hand the role back."
        confirmLabel="Make primary admin"
        pendingLabel="Transferring…"
        onConfirm={() =>
          runAction(
            () => makePrimaryAdminAction(orgSlug, member.membershipId),
            `${member.fullName} is now the primary admin.`
          )
        }
      />
    </Sheet>
  )
}
