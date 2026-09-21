'use client'

import { Building2, UserPlus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import {
  FxToggleGroup,
  FxToggleGroupItem,
} from '@/components/shared/fx-toggle-group'
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
import { TableBody } from '@/components/ui/table'
import { isAdminRole } from '@/lib/role'
import { cn } from '@/lib/utils'

import { deactivateClientAction, deactivateMembershipAction } from '../actions'
import type { ClientCompanyRow, MembersClientsData, PersonRow } from '../types'
import { InviteMemberSheet } from './invite-member-sheet'
import { NewClientSheet } from './new-client-sheet'

const AVATAR_COLORS = [
  'bg-primary',
  'bg-info',
  'bg-success',
  'bg-purple-500',
  'bg-warning',
  'bg-teal-500',
]

const ROLE_BADGE: Record<PersonRow['role'], string> = {
  owner: 'bg-warning-subtle text-warning',
  admin: 'bg-info-subtle text-info',
  member: 'bg-success-subtle text-success',
  client: 'bg-muted text-muted-foreground',
}

type PendingDeactivate =
  | { kind: 'member'; label: string; membershipId: string }
  | { kind: 'client'; label: string; clientId: string }

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words.length === 1
    ? words[0]!.slice(0, 2).toUpperCase()
    : (words[0]![0]! + words[1]![0]!).toUpperCase()
}

function MetricCard({
  label,
  value,
  caption,
  valueClassName,
}: {
  label: string
  value: string
  caption: string
  valueClassName?: string
}) {
  return (
    <FxCard>
      <FxCardContent className="space-y-1.5 p-5">
        <p className="text-muted-foreground text-[13px] font-medium">{label}</p>
        <p
          className={`text-foreground text-2xl font-bold ${valueClassName ?? ''}`}
        >
          {value}
        </p>
        <p className="text-muted-foreground text-xs">{caption}</p>
      </FxCardContent>
    </FxCard>
  )
}

function StatusCell({ isActive = true }: { isActive?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[13px] font-medium',
        isActive ? 'text-success' : 'text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          isActive ? 'bg-success' : 'bg-muted-foreground'
        )}
      />
      {isActive ? 'Active' : 'Deactivated'}
    </span>
  )
}

function MemberTable({
  rows,
  viewerRole,
  onDeactivate,
}: {
  rows: PersonRow[]
  viewerRole: MembersClientsData['viewerRole']
  onDeactivate: (row: PersonRow) => void
}) {
  const canDeactivate = viewerRole === 'owner'

  return (
    <FxCard className="overflow-hidden p-0">
      <div className="w-full overflow-x-auto">
        <FxTable className="w-full min-w-160">
          <FxTableHeader>
            <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
              <FxTableHead>Person</FxTableHead>
              <FxTableHead>Work email</FxTableHead>
              <FxTableHead>Role</FxTableHead>
              <FxTableHead>Status</FxTableHead>
              <FxTableHead className="text-right">Manage</FxTableHead>
            </FxTableRow>
          </FxTableHeader>

          <TableBody className="divide-border divide-y">
            {rows.length === 0 && (
              <FxTableRow>
                <FxTableCell
                  colSpan={5}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  Nobody here yet.
                </FxTableCell>
              </FxTableRow>
            )}

            {rows.map((row, index) => {
              const showDeactivate =
                canDeactivate &&
                row.isActive &&
                row.role !== 'admin' &&
                row.role !== 'owner'

              return (
                <FxTableRow key={row.membershipId}>
                  <FxTableCell>
                    <div className="flex items-center gap-3">
                      <div
                        aria-hidden="true"
                        className={`text-brand-white flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          AVATAR_COLORS[index % AVATAR_COLORS.length]
                        }`}
                      >
                        {initialsOf(row.fullName)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-foreground text-[13.5px] font-semibold">
                          {row.fullName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {row.subtitle}
                        </span>
                      </div>
                    </div>
                  </FxTableCell>

                  <FxTableCell>
                    <div className="flex flex-col">
                      <span className="text-foreground text-[13px]">
                        {row.email ?? '-'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {row.lastActiveLabel}
                      </span>
                    </div>
                  </FxTableCell>

                  <FxTableCell>
                    <FxBadge
                      className={`${ROLE_BADGE[row.role]} capitalize`}
                      shape="pill"
                    >
                      {row.role}
                    </FxBadge>
                  </FxTableCell>

                  <FxTableCell>
                    <StatusCell isActive={row.isActive} />
                  </FxTableCell>

                  <FxTableCell>
                    <div className="flex items-center justify-end gap-2">
                      <FxButton
                        variant="secondary"
                        size="xs"
                        onClick={() =>
                          toast.info('Member profiles are coming soon.')
                        }
                      >
                        View
                      </FxButton>
                      {showDeactivate && (
                        <FxButton
                          variant="secondary"
                          size="xs"
                          onClick={() => onDeactivate(row)}
                        >
                          Deactivate
                        </FxButton>
                      )}
                    </div>
                  </FxTableCell>
                </FxTableRow>
              )
            })}
          </TableBody>
        </FxTable>
      </div>
    </FxCard>
  )
}

function ClientTable({
  rows,
  canManage,
  onDeactivate,
}: {
  rows: ClientCompanyRow[]
  canManage: boolean
  onDeactivate: (row: ClientCompanyRow) => void
}) {
  return (
    <FxCard className="overflow-hidden p-0">
      <div className="w-full overflow-x-auto">
        <FxTable className="w-full min-w-160">
          <FxTableHeader>
            <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
              <FxTableHead>Client</FxTableHead>
              <FxTableHead>Primary contact</FxTableHead>
              <FxTableHead>Status</FxTableHead>
              <FxTableHead className="text-right">Manage</FxTableHead>
            </FxTableRow>
          </FxTableHeader>

          <TableBody className="divide-border divide-y">
            {rows.length === 0 && (
              <FxTableRow>
                <FxTableCell
                  colSpan={4}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  No clients yet.
                </FxTableCell>
              </FxTableRow>
            )}

            {rows.map((row, index) => (
              <FxTableRow key={row.id}>
                <FxTableCell>
                  <div className="flex items-center gap-3">
                    <div
                      aria-hidden="true"
                      className={`text-brand-white flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        AVATAR_COLORS[index % AVATAR_COLORS.length]
                      }`}
                    >
                      {initialsOf(row.name)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-foreground text-[13.5px] font-semibold">
                        {row.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {row.projectCount === 0
                          ? 'No projects yet'
                          : `${row.projectCount} project${row.projectCount === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  </div>
                </FxTableCell>

                <FxTableCell>
                  <div className="flex flex-col">
                    <span className="text-foreground text-[13px]">
                      {row.contactName ?? '-'}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {row.contactEmail ?? 'No contact on file'}
                    </span>
                  </div>
                </FxTableCell>

                <FxTableCell>
                  <StatusCell isActive={row.isActive} />
                </FxTableCell>

                <FxTableCell>
                  <div className="flex items-center justify-end gap-2">
                    <FxButton
                      variant="secondary"
                      size="xs"
                      onClick={() =>
                        toast.info('Client profiles are coming soon.')
                      }
                    >
                      View
                    </FxButton>
                    {canManage && row.isActive && (
                      <FxButton
                        variant="secondary"
                        size="xs"
                        onClick={() => onDeactivate(row)}
                      >
                        Deactivate
                      </FxButton>
                    )}
                  </div>
                </FxTableCell>
              </FxTableRow>
            ))}
          </TableBody>
        </FxTable>
      </div>
    </FxCard>
  )
}

export function MembersClientsView({
  data,
  orgSlug,
}: {
  data: MembersClientsData
  orgSlug: string
}) {
  const { metrics, members, clients, projectOptions, viewerRole } = data

  const [tab, setTab] = useState<'members' | 'clients'>('members')
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [isNewClientOpen, setIsNewClientOpen] = useState(false)
  const [pendingDeactivate, setPendingDeactivate] =
    useState<PendingDeactivate | null>(null)
  const [isPending, startTransition] = useTransition()

  const canManage = isAdminRole(viewerRole)

  const handleConfirmDeactivate = () => {
    if (!pendingDeactivate) return
    const target = pendingDeactivate

    startTransition(async () => {
      const result =
        target.kind === 'member'
          ? await deactivateMembershipAction(orgSlug, target.membershipId)
          : await deactivateClientAction(orgSlug, target.clientId)

      if (!result.ok) {
        toast.error(result.error)
      } else {
        toast.success(`${target.label} was deactivated.`)
      }

      setPendingDeactivate(null)
    })
  }

  return (
    <div className="flex w-full flex-col gap-5 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-foreground text-[22px] font-medium tracking-tight">
            Members &amp; clients
          </h1>
          <p className="text-muted-foreground text-sm">
            Everyone with access to this workspace — your team on seats, your
            clients on portals.
          </p>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <FxButton
              variant="secondary"
              onClick={() => setIsNewClientOpen(true)}
              className="gap-1.5"
            >
              <Building2 className="size-4" />
              New client
            </FxButton>
            <FxButton onClick={() => setIsInviteOpen(true)} className="gap-1.5">
              <UserPlus className="size-4" />
              Invite member
            </FxButton>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Seats used"
          value={
            metrics.seatsTotal
              ? `${metrics.seatsUsed} of ${metrics.seatsTotal}`
              : String(metrics.seatsUsed)
          }
          caption={`Seats on the ${metrics.planName} plan`}
        />
        <MetricCard
          label="Pending invites"
          value={String(metrics.pendingInvites)}
          caption={
            metrics.pendingInvites === 0
              ? 'Everyone has accepted'
              : 'Awaiting acceptance'
          }
          valueClassName={metrics.pendingInvites > 0 ? 'text-warning' : ''}
        />
        <MetricCard
          label="Active clients"
          value={String(metrics.activeClients)}
          caption={`${metrics.activeClients} with portal access`}
        />
      </div>

      <FxToggleGroup
        type="single"
        density="cycle-product"
        value={tab}
        onValueChange={(value) => value && setTab(value as typeof tab)}
        aria-label="Members or clients"
        className="w-fit"
      >
        <FxToggleGroupItem
          value="members"
          density="cycle-product"
          className="cursor-pointer"
        >
          Members · {members.length}
        </FxToggleGroupItem>
        <FxToggleGroupItem
          value="clients"
          density="cycle-product"
          className="cursor-pointer"
        >
          Clients · {clients.length}
        </FxToggleGroupItem>
      </FxToggleGroup>

      {tab === 'members' ? (
        <MemberTable
          rows={members}
          viewerRole={viewerRole}
          onDeactivate={(row) =>
            setPendingDeactivate({
              kind: 'member',
              label: row.fullName,
              membershipId: row.membershipId,
            })
          }
        />
      ) : (
        <ClientTable
          rows={clients}
          canManage={canManage}
          onDeactivate={(row) =>
            setPendingDeactivate({
              kind: 'client',
              label: row.name,
              clientId: row.id,
            })
          }
        />
      )}

      <p className="text-muted-foreground text-xs">
        Deactivating keeps every timesheet, invoice and comment intact — it only
        removes access and frees the seat.
      </p>

      <InviteMemberSheet
        orgSlug={orgSlug}
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
      />
      <NewClientSheet
        orgSlug={orgSlug}
        projectOptions={projectOptions}
        open={isNewClientOpen}
        onOpenChange={setIsNewClientOpen}
      />

      <AlertDialog
        open={pendingDeactivate !== null}
        onOpenChange={(open) => !open && setPendingDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {pendingDeactivate?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeactivate?.kind === 'client'
                ? 'This removes the client from your list. Their projects, invoices and time entries stay intact.'
                : 'This removes their access and frees the seat. Every timesheet, invoice and comment they left stays intact.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDeactivate}
              disabled={isPending}
            >
              {isPending ? 'Deactivating…' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
