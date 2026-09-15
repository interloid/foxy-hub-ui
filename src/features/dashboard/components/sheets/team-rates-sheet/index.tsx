'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxInput, FxLabel } from '@/components/shared/fx-field'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
} from '@/components/shared/fx-sheet'
import { updateMemberRatesAction } from '@/features/dashboard/actions'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { TeamMemberOption } from '@/features/dashboard/types'

interface MemberRateRow {
  userId: string
  name: string
  role: string
  defaultRate?: number
  costRate?: number
}

interface TeamRatesFormValues {
  members: MemberRateRow[]
}

interface TeamRatesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function splitMemberLabel(label: string): { name: string; role: string } {
  const [name, role] = label.split('·')

  return { name: (name ?? label).trim(), role: (role ?? '').trim() }
}

function toRate(value: number | undefined | null): number | null {
  return value === undefined || value === null || Number.isNaN(value)
    ? null
    : value
}

export function TeamRatesSheet({ open, onOpenChange }: TeamRatesSheetProps) {
  const { orgSlug } = useWorkspace()

  const [loadError, setLoadError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [original, setOriginal] = useState<MemberRateRow[] | null>(null)

  const isLoading = original === null && loadError === null

  const { register, handleSubmit, reset } = useForm<TeamRatesFormValues>({
    defaultValues: { members: [] },
  })

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    let active = true

    const loadMembers = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/sheet-data?type=team-members&orgSlug=${encodeURIComponent(orgSlug)}`,
          { signal: controller.signal }
        )

        if (!res.ok) throw new Error('Request failed')

        const members: TeamMemberOption[] = await res.json()
        if (!active) return

        const rows: MemberRateRow[] = members.map((member) => {
          const { name, role } = splitMemberLabel(member.name)

          return {
            userId: member.id,
            name,
            role: role || member.role,
            defaultRate: member.defaultRate ?? undefined,
            costRate: member.costRate ?? undefined,
          }
        })

        setOriginal(rows)
        reset({ members: rows })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!active) return

        console.error('Failed to load team members', err)
        setLoadError('Could not load teammates.')
      }
    }

    loadMembers()

    return () => {
      active = false
      controller.abort()
    }
  }, [open, orgSlug, reset])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setOriginal(null)
      setLoadError(null)
    }

    onOpenChange(next)
  }

  const onSubmit = (values: TeamRatesFormValues) => {
    const changed = values.members.filter((row, index) => {
      const before = original?.[index]
      if (!before) return false

      return (
        toRate(row.defaultRate) !== (before.defaultRate ?? null) ||
        toRate(row.costRate) !== (before.costRate ?? null)
      )
    })

    if (changed.length === 0) {
      handleOpenChange(false)
      return
    }

    startTransition(async () => {
      const failures: string[] = []

      for (const row of changed) {
        const res = await updateMemberRatesAction({
          orgSlug,
          userId: row.userId,
          defaultRate: toRate(row.defaultRate),
          costRate: toRate(row.costRate),
        })

        if (!res.ok) failures.push(`${row.name}: ${res.error}`)
      }

      if (failures.length > 0) {
        toast.error(failures[0])
        return
      }

      toast.success(
        changed.length === 1
          ? 'Rates saved'
          : `Rates saved for ${changed.length} teammates`
      )
      handleOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <FxSheetContent className="flex flex-col sm:max-w-125">
        <FxSheetHeader>
          <FxSheetTitle>Team rates</FxSheetTitle>
          <FxSheetDescription>
            Standard rates for each teammate. These seed a project&apos;s
            allocation — changing one here never re-prices a running project.
          </FxSheetDescription>
        </FxSheetHeader>

        <FxSheetBody>
          <form
            id="team-rates-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-3"
          >
            {isLoading ? (
              <p className="text-muted-foreground text-[13px]">
                Loading teammates...
              </p>
            ) : loadError ? (
              <p className="text-destructive text-[13px]">{loadError}</p>
            ) : !original || original.length === 0 ? (
              <p className="text-muted-foreground text-[13px]">
                No teammates in this workspace yet.
              </p>
            ) : (
              original.map((member, index) => (
                <div
                  key={member.userId}
                  className="border-border bg-muted/30 space-y-3 rounded-xl border p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold select-none">
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-[13px] leading-tight font-semibold">
                        {member.name}
                      </p>
                      <p className="text-subtle-foreground text-xs leading-normal">
                        {member.role}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="w-full min-w-0">
                      <FxLabel
                        htmlFor={`bill-rate-${member.userId}`}
                        className="text-muted-foreground mb-1 block text-[10px] font-semibold uppercase"
                      >
                        Bill rate $/hr
                      </FxLabel>
                      <FxInput
                        id={`bill-rate-${member.userId}`}
                        type="number"
                        min={1}
                        step="0.01"
                        placeholder="—"
                        className="h-8 px-2 font-mono text-[12px]"
                        {...register(`members.${index}.defaultRate`, {
                          setValueAs: (val) =>
                            val === '' || val === null || val === undefined
                              ? undefined
                              : parseFloat(val),
                        })}
                      />
                    </div>

                    <div className="w-full min-w-0">
                      <FxLabel
                        htmlFor={`cost-rate-${member.userId}`}
                        className="text-muted-foreground mb-1 block text-[10px] font-semibold uppercase"
                      >
                        Cost $/hr
                      </FxLabel>
                      <FxInput
                        id={`cost-rate-${member.userId}`}
                        type="number"
                        min={1}
                        step="0.01"
                        placeholder="—"
                        className="h-8 px-2 font-mono text-[12px]"
                        {...register(`members.${index}.costRate`, {
                          setValueAs: (val) =>
                            val === '' || val === null || val === undefined
                              ? undefined
                              : parseFloat(val),
                        })}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}

            {!isLoading && !loadError && original && original.length > 0 && (
              <p className="text-muted-foreground text-[11px]">
                Bill rate is what the client is charged. Cost is internal — it
                never appears on an invoice.
              </p>
            )}
          </form>
        </FxSheetBody>

        <FxSheetFooter className="border-border flex-col gap-2 border-t pt-3">
          <div className="flex w-full items-center justify-end gap-2">
            <FxButton
              variant="outline"
              type="button"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
              className="text-foreground border-border text-[12.5px]"
            >
              Cancel
            </FxButton>
            <FxButton
              variant="default"
              type="submit"
              form="team-rates-form"
              disabled={isPending || isLoading || !original?.length}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-[12.5px] font-semibold disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save rates'}
            </FxButton>
          </div>
        </FxSheetFooter>
      </FxSheetContent>
    </Sheet>
  )
}
