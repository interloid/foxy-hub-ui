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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'

import { inviteMemberAction } from '../actions'
import type { InvitableStaffRole } from '@/lib/role'

interface InviteMemberSheetProps {
  orgSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ROLE_OPTIONS = [
  {
    value: 'Contributor',
    label: 'Contributor — projects and time, no billing',
  },
  { value: 'Manager', label: 'Manager — everything except billing' },
  { value: 'Admin', label: 'Admin — everything except ownership' },
] as const satisfies readonly { value: InvitableStaffRole; label: string }[]

export function InviteMemberSheet({
  orgSlug,
  open,
  onOpenChange,
}: InviteMemberSheetProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<InvitableStaffRole>('Contributor')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setIsSubmitting(true)
    const result = await inviteMemberAction(orgSlug, {
      email: email.trim(),
      role,
      fullName: fullName.trim() || undefined,
    })
    setIsSubmitting(false)

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
    setEmail('')
    setFullName('')
    setRole('Contributor')
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent>
        <FxSheetHeader>
          <FxSheetTitle>Invite a teammate</FxSheetTitle>
          <FxSheetDescription>
            They get an email invite and hold a seat once they accept. Role can
            change any time.
          </FxSheetDescription>
        </FxSheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <FxSheetBody className="space-y-1">
            <FxField>
              <FxLabel htmlFor="invite-member-email">
                Work email <span className="text-destructive">*</span>
              </FxLabel>
              <FxInput
                id="invite-member-email"
                type="email"
                required
                placeholder="name@example.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FxField>

            <FxField>
              <FxLabel htmlFor="invite-member-name">Full name</FxLabel>
              <FxInput
                id="invite-member-name"
                placeholder="John"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </FxField>

            <FxField className="pb-2">
              <FxLabel htmlFor="invite-member-role">Role</FxLabel>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as InvitableStaffRole)}
              >
                <SelectTrigger
                  id="invite-member-role"
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
              Only the Primary admin can hand over ownership, and only Primary
              admins and Admins see billing.
            </p>
          </FxSheetBody>

          <FxSheetFooter>
            <FxButton
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </FxButton>
            <FxButton type="submit" disabled={isSubmitting} className="gap-1.5">
              <Check className="size-4" />
              {isSubmitting ? 'Sending…' : 'Send invite'}
            </FxButton>
          </FxSheetFooter>
        </form>
      </FxSheetContent>
    </Sheet>
  )
}
