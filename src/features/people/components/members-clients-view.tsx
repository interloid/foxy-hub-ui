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
import { TableBody } from '@/components/ui/table'
import { isAdminRole } from '@/lib/role'
import { cn } from '@/lib/utils'

import { FxConfirmDialog } from '@/components/shared/fx-confirm-dialog'
import { AccountDTO } from '@/lib/dal'
import { roleLabel } from '@/lib/role'
import {
  deactivateClientAction,
  deactivateMembershipAction,
  reactivateMembershipAction,
  setClientStatusAction,
} from '../actions'
import {
  canDeactivateMember,
  canReactivateMember,
} from '../lib/can-deactivate-member'
import { clientStatusCopy, memberReactivateCopy } from '../lib/client-copy'
import type { ClientCompanyRow, MembersClientsData, PersonRow } from '../types'
import { EditClientSheet } from './edit-client-sheet'
import { EditMemberSheet } from './edit-member-sheet'
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
  primary_admin: 'bg-primary-subtle text-primary',
  admin: 'bg-info-subtle text-info',
  manager: 'bg-warning-subtle text-warning',
  contributor: 'bg-success-subtle text-success',
  client: 'bg-muted text-muted-foreground',
}

type PendingDeactivate =
  | { kind: 'member'; label: string; membershipId: string }
  | { kind: 'reactivate-member'; label: string; membershipId: string }
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
        <p className="text-muted-foreground text-[12.5px] font-medium">
          {label}
        </p>
        <p
          className={`text-foreground text-[24px] font-bold ${valueClassName ?? ''}`}
        >
          {value}
        </p>
        <p className="text-muted-foreground text-[12px]">{caption}</p>
      </FxCardContent>
    </FxCard>
  )
}

function StatusCell({ isActive = true }: { isActive?: boolean }) {
  return (
    <FxBadge
      dot
      shape="pill"
      className={cn(
        isActive
          ? 'bg-success-subtle text-success'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {isActive ? 'Active' : 'Deactivated'}
    </FxBadge>
  )
}

function PortalCell({ hasPortal }: { hasPortal: boolean }) {
  return (
    <FxBadge
      shape="pill"
      className={cn(
        hasPortal
          ? 'bg-success-subtle text-success'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {hasPortal ? 'Portal on' : 'Portal off'}
    </FxBadge>
  )
}

const DEACTIVATED_ROW = 'opacity-55 [&_button]:opacity-100'

function MemberTable({
  rows,
  viewerRole,
  viewerId,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  rows: PersonRow[]
  viewerRole: MembersClientsData['viewerRole']
  viewerId: string | null
  onEdit: (row: PersonRow) => void
  onDeactivate: (row: PersonRow) => void
  onReactivate: (row: PersonRow) => void
}) {
  return (
    <FxCard className="overflow-hidden p-0">
      <div className="w-full overflow-x-auto">
        <FxTable className="w-full min-w-180">
          <FxTableHeader>
            <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
              <FxTableHead>Person</FxTableHead>
              <FxTableHead>Work email</FxTableHead>
              <FxTableHead>Projects</FxTableHead>
              <FxTableHead>Role</FxTableHead>
              <FxTableHead>Status</FxTableHead>
              <FxTableHead className="text-right">Manage</FxTableHead>
            </FxTableRow>
          </FxTableHeader>

          <TableBody className="divide-border divide-y">
            {rows.length === 0 && (
              <FxTableRow>
                <FxTableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  Nobody here yet.
                </FxTableCell>
              </FxTableRow>
            )}

            {rows.map((row, index) => {
              const showDeactivate = canDeactivateMember(
                viewerRole,
                viewerId,
                row
              )
              const showReactivate = canReactivateMember(
                viewerRole,
                viewerId,
                row
              )

              return (
                <FxTableRow
                  key={row.membershipId}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${row.fullName}`}
                  className={cn(
                    'hover:bg-secondary/20 cursor-pointer',
                    !row.isActive && DEACTIVATED_ROW
                  )}
                  onClick={() => onEdit(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onEdit(row)
                    }
                  }}
                >
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
                    <div className="flex flex-col">
                      <span className="text-foreground text-[13px]">
                        {row.ownedProjectCount > 0
                          ? `Owns ${row.ownedProjectCount}`
                          : 'Owns none'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {row.allocatedProjectCount > 0
                          ? `Works on ${row.allocatedProjectCount}`
                          : 'Not allocated'}
                      </span>
                    </div>
                  </FxTableCell>

                  <FxTableCell>
                    <FxBadge
                      className={`${ROLE_BADGE[row.role]} whitespace-nowrap`}
                      shape="pill"
                    >
                      {roleLabel(row.role)}
                    </FxBadge>
                  </FxTableCell>

                  <FxTableCell>
                    <StatusCell isActive={row.isActive} />
                  </FxTableCell>

                  <FxTableCell>
                    <div className="flex items-center justify-end gap-2">
                      <FxButton
                        variant="secondary"
                        className="bg-muted"
                        size="xs"
                        onClick={() => onEdit(row)}
                      >
                        View
                      </FxButton>
                      {showDeactivate && (
                        <FxButton
                          variant="secondary"
                          size="xs"
                          className="hover:text-destructive hover:border-destructive hover:bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeactivate(row)
                          }}
                        >
                          Deactivate
                        </FxButton>
                      )}
                      {showReactivate && (
                        <FxButton
                          variant="secondary"
                          size="xs"
                          className="hover:text-success hover:border-success hover:bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            onReactivate(row)
                          }}
                        >
                          Reactivate
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
  onEdit,
  onToggleStatus,
}: {
  rows: ClientCompanyRow[]
  canManage: boolean
  onEdit: (row: ClientCompanyRow) => void
  onToggleStatus: (row: ClientCompanyRow) => void
}) {
  return (
    <FxCard className="overflow-hidden p-0">
      <div className="w-full overflow-x-auto">
        <FxTable className="w-full min-w-160">
          <FxTableHeader>
            <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
              <FxTableHead>Client</FxTableHead>
              <FxTableHead>Primary contact</FxTableHead>
              <FxTableHead>Portal</FxTableHead>
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
                  No clients yet.
                </FxTableCell>
              </FxTableRow>
            )}

            {rows.map((row, index) => (
              <FxTableRow
                key={row.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${row.name}`}
                className={cn(
                  'hover:bg-secondary/20 cursor-pointer',
                  !row.isActive && DEACTIVATED_ROW
                )}
                onClick={() => onEdit(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onEdit(row)
                  }
                }}
              >
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
                  <PortalCell hasPortal={row.hasPortal} />
                </FxTableCell>

                <FxTableCell>
                  <StatusCell isActive={row.isActive} />
                </FxTableCell>

                <FxTableCell>
                  <div className="flex items-center justify-end gap-2">
                    <FxButton
                      variant="secondary"
                      size="xs"
                      className="bg-muted"
                      onClick={() => onEdit(row)}
                    >
                      View
                    </FxButton>
                    {canManage && (
                      <FxButton
                        variant="secondary"
                        className={cn(
                          'hover:bg-transparent',
                          row.isActive
                            ? 'hover:text-destructive hover:border-destructive'
                            : 'hover:text-success hover:border-success'
                        )}
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleStatus(row)
                        }}
                      >
                        {row.isActive ? 'Deactivate' : 'Reactivate'}
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
  account,
}: {
  data: MembersClientsData
  orgSlug: string
  account: AccountDTO | null
}) {
  const { metrics, members, clients, projectOptions, viewerRole } = data
  const viewerId = account?.id ?? null

  const [tab, setTab] = useState<'members' | 'clients'>('members')
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [isNewClientOpen, setIsNewClientOpen] = useState(false)
  const [pendingDeactivate, setPendingDeactivate] =
    useState<PendingDeactivate | null>(null)
  const [editingClient, setEditingClient] = useState<ClientCompanyRow | null>(
    null
  )
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<PersonRow | null>(null)
  const [isMemberEditOpen, setIsMemberEditOpen] = useState(false)

  const openMember = (row: PersonRow) => {
    setEditingMember(row)
    setIsMemberEditOpen(true)
  }

  const openClient = (row: ClientCompanyRow) => {
    setEditingClient(row)
    setIsEditOpen(true)
  }
  const [isPending, startTransition] = useTransition()

  const canManage = isAdminRole(viewerRole)

  const handleConfirmDeactivate = () => {
    if (!pendingDeactivate) return
    const target = pendingDeactivate

    startTransition(async () => {
      const result =
        target.kind === 'member'
          ? await deactivateMembershipAction(orgSlug, target.membershipId)
          : target.kind === 'reactivate-member'
            ? await reactivateMembershipAction(orgSlug, target.membershipId)
            : await deactivateClientAction(orgSlug, target.clientId)

      if (!result.ok) {
        toast.error(result.error)
      } else {
        toast.success(
          `${target.label} was ${
            target.kind === 'reactivate-member' ? 'reactivated' : 'deactivated'
          }.`
        )
      }

      setPendingDeactivate(null)
    })
  }

  return (
    <div className="flex w-full flex-col gap-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-foreground text-[24px] font-medium tracking-tight">
            People
          </h1>
          <p className="text-muted-foreground text-[14px]">
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
          caption={`${metrics.clientsWithPortal} with portal access`}
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
          Team · {members.length}
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
          viewerId={viewerId}
          onEdit={openMember}
          onDeactivate={(row) =>
            setPendingDeactivate({
              kind: 'member',
              label: row.fullName,
              membershipId: row.membershipId,
            })
          }
          onReactivate={(row) =>
            setPendingDeactivate({
              kind: 'reactivate-member',
              label: row.fullName,
              membershipId: row.membershipId,
            })
          }
        />
      ) : (
        <ClientTable
          rows={clients}
          canManage={canManage}
          onEdit={openClient}
          onToggleStatus={(row) =>
            row.isActive
              ? setPendingDeactivate({
                  kind: 'client',
                  label: row.name,
                  clientId: row.id,
                })
              : startTransition(async () => {
                  const result = await setClientStatusAction(
                    orgSlug,
                    row.id,
                    true
                  )
                  if (!result.ok) toast.error(result.error)
                  else toast.success(`${row.name} was reactivated.`)
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

      <EditMemberSheet
        orgSlug={orgSlug}
        canManage={canManage}
        member={editingMember}
        viewerRole={viewerRole}
        viewerId={viewerId}
        open={isMemberEditOpen}
        onOpenChange={setIsMemberEditOpen}
      />

      <EditClientSheet
        orgSlug={orgSlug}
        client={editingClient}
        open={isEditOpen}
        canManage={canManage}
        onOpenChange={setIsEditOpen}
      />

      {pendingDeactivate &&
        (() => {
          const copy =
            pendingDeactivate.kind === 'client'
              ? clientStatusCopy(pendingDeactivate.label, true)
              : pendingDeactivate.kind === 'reactivate-member'
                ? memberReactivateCopy(pendingDeactivate.label)
                : {
                    title: `Deactivate ${pendingDeactivate.label}?`,
                    description:
                      'This removes their access and frees the seat. Every timesheet, invoice and comment they left stays intact.',
                    confirmLabel: 'Deactivate',
                    pendingLabel: 'Deactivating…',
                    destructive: true,
                  }

          return (
            <FxConfirmDialog
              open
              onOpenChange={(open) => !open && setPendingDeactivate(null)}
              isPending={isPending}
              onConfirm={handleConfirmDeactivate}
              {...copy}
            />
          )
        })()}
    </div>
  )
}
