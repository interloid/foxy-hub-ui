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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'

import type { InvitableStaffRole } from '@/lib/role'
import { inviteMemberAction } from '../actions'
import { NETWORK_ERROR } from '../lib/network-error'
import {
  fieldError,
  fullNameSchema,
  inviteEmailSchema,
  jobTitleSchema,
} from '../schemas'

interface InviteMemberSheetProps {
  orgSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ROLE_OPTIONS = [
  {
    value: 'Contributor',
    label: 'Contributor - assigned projects time only',
  },
  {
    value: 'Manager',
    label: 'Manager - full control of the projects they own',
  },
  { value: 'Admin', label: 'Admin - whole workspace, billing, setting' },
] as const satisfies readonly { value: InvitableStaffRole; label: string }[]

export function InviteMemberSheet({
  orgSlug,
  open,
  onOpenChange,
}: InviteMemberSheetProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<InvitableStaffRole>('Contributor')
  const [jobTitle, setJobTitle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touched, setTouched] = useState({
    email: false,
    fullName: false,
    jobTitle: false,
  })
  const [showDiscard, setShowDiscard] = useState(false)

  const touch = (field: keyof typeof touched) =>
    setTouched((prev) => ({ ...prev, [field]: true }))

  const emailError = fieldError(inviteEmailSchema, email)
  const fullNameError = fieldError(fullNameSchema, fullName)
  const jobTitleError = fieldError(jobTitleSchema, jobTitle)
  const hasErrors = Boolean(emailError || fullNameError || jobTitleError)

  const isDirty =
    email.trim() !== '' ||
    fullName.trim() !== '' ||
    jobTitle !== '' ||
    role !== 'Contributor'

  const resetForm = () => {
    setEmail('')
    setFullName('')
    setRole('Contributor')
    setJobTitle('')
    setTouched({ email: false, fullName: false, jobTitle: false })
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, fullName: true, jobTitle: true })
    if (hasErrors) return

    setIsSubmitting(true)
    let result
    try {
      result = await inviteMemberAction(orgSlug, {
        email: email.trim(),
        role,
        fullName: fullName.trim() || undefined,
        jobTitle,
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

    if (result.data.failed.length > 0) {
      toast.error(
        `Could not invite ${result.data.failed[0]} — they may already have an account.`
      )
      return
    }

    toast.success(`Invite sent to ${email.trim()}`)
    resetForm()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <FxSheetContent className="data-[side=right]:md:max-w-165">
        <FxSheetHeader>
          <FxSheetTitle>Invite a teammate</FxSheetTitle>
          <FxSheetDescription>
            They get an email invite and hold a seat once they accept. Role can
            change any time.
          </FxSheetDescription>
        </FxSheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-2">
            <FxField>
              <FxLabel htmlFor="invite-member-email">
                Email <span className="text-destructive">*</span>
              </FxLabel>
              <FxInput
                id="invite-member-email"
                type="email"
                required
                placeholder="name@example.co"
                value={email}
                aria-invalid={touched.email && emailError !== null}
                aria-describedby={
                  touched.email && emailError
                    ? 'invite-member-email-error'
                    : undefined
                }
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => touch('email')}
              />
              {touched.email && emailError && (
                <FxFieldError id="invite-member-email-error">
                  {emailError}
                </FxFieldError>
              )}
            </FxField>

            <div className="md:flex md:gap-4">
              <FxField>
                <FxLabel htmlFor="invite-member-name">
                  Full name
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FxLabel>
                <FxInput
                  id="invite-member-name"
                  maxLength={80}
                  placeholder="John"
                  value={fullName}
                  aria-invalid={touched.fullName && fullNameError !== null}
                  aria-describedby={
                    touched.fullName && fullNameError
                      ? 'invite-member-name-error'
                      : undefined
                  }
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => touch('fullName')}
                />
                {touched.fullName && fullNameError && (
                  <FxFieldError id="invite-member-name-error">
                    {fullNameError}
                  </FxFieldError>
                )}
              </FxField>

              <FxField>
                <FxLabel htmlFor="invite-member-job-title">
                  Job title
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FxLabel>
                <FxInput
                  id="invite-member-job-title"
                  maxLength={60}
                  placeholder="Product Designer"
                  value={jobTitle}
                  aria-invalid={touched.jobTitle && jobTitleError !== null}
                  aria-describedby={
                    touched.jobTitle && jobTitleError
                      ? 'invite-member-job-title-error'
                      : undefined
                  }
                  onChange={(e) => setJobTitle(e.target.value)}
                  onBlur={() => touch('jobTitle')}
                />
                {touched.jobTitle && jobTitleError && (
                  <FxFieldError id="invite-member-job-title-error">
                    {jobTitleError}
                  </FxFieldError>
                )}
              </FxField>
            </div>

            <FxField className="pb-2">
              <FxLabel htmlFor="invite-member-role">Role</FxLabel>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as InvitableStaffRole)}
              >
                <SelectTrigger
                  id="invite-member-role"
                  className="bg-muted border-border h-12! w-full cursor-pointer p-2"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="p-1"
                >
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="cursor-pointer p-2"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FxField>

            <p className="text-muted-foreground text-xs">
              Only the Primary Admin can hand over ownership, and only Admins
              see billing.
            </p>
          </FxSheetBody>

          <FxSheetFooter>
            <FxButton
              type="button"
              variant="secondary"
              onClick={discardAndClose}
            >
              Cancel
            </FxButton>
            <FxButton
              type="submit"
              disabled={isSubmitting || hasErrors}
              className="gap-1.5"
            >
              <Check className="size-4" />
              {isSubmitting ? 'Sending…' : 'Send invite'}
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
                <AlertDialogTitle>Discard this invite?</AlertDialogTitle>
                <AlertDialogDescription>
                  Nothing is sent until you press Send invite — closing now
                  loses what you typed.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer"
              variant="destructive"
              onClick={discardAndClose}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
