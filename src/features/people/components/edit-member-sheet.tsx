'use client'

import { Check } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/shared/app/user-avatar'
import { FxBadge } from '@/components/shared/fx-badge'
import { DemoDisabled } from '@/components/shared/demo-disabled'
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
import { initialsOf } from '@/lib/initials'
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
import { assignableRoles, canEditMember } from '../lib/can-edit-member'
import { memberReactivateCopy } from '../lib/client-copy'
import { NETWORK_ERROR } from '../lib/network-error'
import { fieldError, fullNameSchema, jobTitleSchema } from '../schemas'
import type { PersonRow } from '../types'

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
  const nameRef = useRef<HTMLInputElement>(null)
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
  const isSelf = member.userId === viewerId
  // Primary admin edits anyone; an admin edits themselves, managers and contributors.
  const canEdit = canManage && canEditMember(viewerRole, viewerId, member)
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
      <FxSheetContent
        className="data-[side=right]:sm:max-w-165"
        onOpenAutoFocus={(e) => {
          const input = nameRef.current
          if (!input || input.disabled) return
          e.preventDefault()
          input.focus()
          input.setSelectionRange(input.value.length, input.value.length)
        }}
      >
        <FxSheetHeader>
          <div className="flex items-start gap-3">
            <UserAvatar
              initials={initialsOf(member.savedName, member.email)}
              avatarUrl={member.avatarUrl}
              className="size-9 text-xs font-bold"
            />
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
          </div>
        </FxSheetHeader>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-6">
            <section className="space-y-1">
              <SectionLabel>Profile</SectionLabel>
              <FxField>
                <FxLabel htmlFor="edit-member-name">Full name</FxLabel>
                <FxInput
                  ref={nameRef}
                  id="edit-member-name"
                  maxLength={80}
                  disabled={!canEdit}
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
                <FxLabel htmlFor="edit-member-job-title">Job title</FxLabel>
                <FxInput
                  id="edit-member-job-title"
                  maxLength={60}
                  disabled={!canEdit}
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
            </section>

            {canManage && (
              <section className="space-y-1">
                <SectionLabel>Access</SectionLabel>
                {canManage && !canEdit && (
                  <p className="text-muted-foreground border-border rounded-lg border p-3 text-xs">
                    Only the primary admin can edit another admin.
                  </p>
                )}

                {canEdit && (
                  <FxField>
                    <FxLabel htmlFor="edit-member-role">Role</FxLabel>
                    {isPrimary ? (
                      <p className="text-muted-foreground border-border rounded-lg border p-3 text-xs">
                        The primary admin&apos;s role cannot be changed here.
                        Hand it to another admin from their row instead — the
                        workspace always has exactly one.
                      </p>
                    ) : isSelf ? (
                      <p className="text-muted-foreground border-border rounded-lg border p-3 text-xs">
                        You can&apos;t change your own role. Ask the primary
                        admin if it needs to change.
                      </p>
                    ) : (
                      <DemoDisabled className="flex w-full">
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
                            {assignableRoles(viewerRole).map((r) => (
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
                      </DemoDisabled>
                    )}
                  </FxField>
                )}
              </section>
            )}

            {canResetMfa && (
              <section className="border-border bg-muted/40 space-y-3 rounded-lg border p-3.5">
                <div className="space-y-1">
                  <h3 className="text-foreground text-2xs font-semibold tracking-wide uppercase">
                    Two-factor authentication
                  </h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    For when they have lost their authenticator app. They sign
                    in with just their password until they turn it on again.
                  </p>
                </div>
                <DemoDisabled className="flex w-full">
                  <FxButton
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={isWorking}
                    onClick={() => setShowResetMfa(true)}
                  >
                    Reset 2FA
                  </FxButton>
                </DemoDisabled>
              </section>
            )}

            {canPromote && (
              <section className="border-border bg-muted/40 space-y-3 rounded-lg border p-3.5">
                <div className="space-y-1">
                  <h3 className="text-foreground text-2xs font-semibold tracking-wide uppercase">
                    Primary admin
                  </h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    They take over billing, ownership and workspace settings.
                    You become an admin.
                  </p>
                </div>
                <DemoDisabled className="flex w-full">
                  <FxButton
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={isWorking}
                    onClick={() => setShowPromote(true)}
                  >
                    Make primary admin
                  </FxButton>
                </DemoDisabled>
              </section>
            )}

            {showDeactivate && canManage && (
              <section className="border-destructive/25 bg-destructive-subtle space-y-3 rounded-lg border p-3.5">
                <div className="space-y-1">
                  <h3 className="text-destructive text-2xs font-semibold tracking-wide uppercase">
                    Danger zone
                  </h3>
                  <p className="text-destructive/80 text-xs leading-relaxed">
                    Deactivating removes this member&apos;s access immediately.
                    This can be undone later.
                  </p>
                </div>
                <DemoDisabled className="flex w-full">
                  <FxButton
                    type="button"
                    variant="secondary"
                    className="border-destructive/30 text-destructive hover:border-destructive hover:bg-card w-full"
                    disabled={isWorking}
                    onClick={() => setShowDeactivateConfirm(true)}
                  >
                    Deactivate member
                  </FxButton>
                </DemoDisabled>
              </section>
            )}

            {showReactivate && canManage && (
              <section className="border-success/25 bg-success-subtle space-y-3 rounded-lg border p-3.5">
                <div className="space-y-1">
                  <h3 className="text-success text-2xs font-semibold tracking-wide uppercase">
                    Deactivated
                  </h3>
                  <p className="text-success/80 text-xs leading-relaxed">
                    Reactivating gives them their access back and takes a seat.
                  </p>
                </div>
                <DemoDisabled className="flex w-full">
                  <FxButton
                    type="button"
                    variant="secondary"
                    className="border-success/30 text-success hover:border-success hover:bg-card w-full"
                    disabled={isWorking}
                    onClick={() => setShowReactivateConfirm(true)}
                  >
                    Reactivate member
                  </FxButton>
                </DemoDisabled>
              </section>
            )}
          </FxSheetBody>

          <FxSheetFooter className="justify-end">
            <FxButton
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </FxButton>
            {canEdit && (
              <FxButton
                type="submit"
                disabled={isSaving || hasErrors || !isDirty}
                className="gap-1.5"
              >
                <Check className="size-4" />
                {isSaving ? 'Saving…' : 'Save changes'}
              </FxButton>
            )}
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-muted-foreground text-2xs pb-1 font-semibold tracking-wide uppercase">
      {children}
    </h3>
  )
}
