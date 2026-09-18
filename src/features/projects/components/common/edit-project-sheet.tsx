'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxField, FxInput, FxLabel } from '@/components/shared/fx-field'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  FxDropdownMenuContent,
  FxDropdownMenuItem,
} from '@/components/shared/fx-menu'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
} from '@/components/shared/fx-sheet'
import { Sheet } from '@/components/ui/sheet'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'

import { FxTextarea } from '@/components/shared/fx-textarea'
import { updateProjectWithValidation } from '../../actions'
import { PROJECT_STATUS_CONFIG } from '../../constants'
import type { Project, ProjectStatus } from '../../types'

interface EditProjectSheetProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

const AVAILABLE_STATUSES: ProjectStatus[] = [
  'in-progress',
  'completed',
  'on-hold',
  'cancelled',
  'pending-approval',
]

export function EditProjectSheet({
  project,
  open,
  onOpenChange,
}: EditProjectSheetProps) {
  const { orgSlug } = useWorkspace()

  const [name, setName] = useState(project.name ?? '')
  const [description, setDescription] = useState(project.description ?? '')
  const [status, setStatus] = useState<ProjectStatus>(
    (project.status as ProjectStatus) ?? 'pending'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setIsSubmitting(true)

      await updateProjectWithValidation({
        projectId: project.id,
        orgSlug,
        name,
        description,
        status,
      })

      toast.success('Project updated successfully!')
      onOpenChange(false)
    } catch (error) {
      console.error('Update failed:', error)

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update project.'

      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent>
        <FxSheetHeader>
          <FxSheetTitle>Update Project</FxSheetTitle>
          <FxSheetDescription>
            Modify project settings and operational details.
          </FxSheetDescription>
        </FxSheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col justify-between overflow-hidden"
        >
          <FxSheetBody className="space-y-4">
            {/* Project Name */}
            <FxField>
              <FxLabel
                htmlFor="projectName"
                className="text-muted-foreground required-star text-[13px] leading-normal font-medium"
              >
                Project Name
              </FxLabel>
              <FxInput
                id="projectName"
                type="text"
                value={name}
                className="h-9 text-[13px]"
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Enter project name"
              />
            </FxField>

            {/* Description */}
            <FxField>
              <FxLabel htmlFor="projectDescription">Description</FxLabel>
              <FxTextarea
                id="projectDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add project description..."
                rows={3}
              />
            </FxField>

            {/* Status Dropdown */}
            <FxField>
              <FxLabel htmlFor="projectStatus">Status</FxLabel>
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="cursor-pointer">
                  <button
                    id="projectStatus"
                    type="button"
                    className="border-input bg-background text-foreground focus:ring-ring flex h-9 w-full items-center justify-between rounded-md border px-3 text-sm focus:ring-1 focus:outline-none"
                  >
                    <span>
                      {PROJECT_STATUS_CONFIG[status]?.label ?? status}
                    </span>
                    <ChevronDown className="size-4 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <FxDropdownMenuContent align="start" className="w-60">
                  {AVAILABLE_STATUSES.map((st) => (
                    <FxDropdownMenuItem key={st} onClick={() => setStatus(st)}>
                      {PROJECT_STATUS_CONFIG[st]?.label ?? st}
                    </FxDropdownMenuItem>
                  ))}
                </FxDropdownMenuContent>
              </DropdownMenu>
            </FxField>

            {/* Engagement Details Read-Only Context Card */}
            <div className="bg-muted/40 border-border text-muted-foreground space-y-2 rounded-lg border p-3.5 text-xs">
              <span className="text-foreground block text-[11px] font-semibold tracking-wider uppercase">
                Engagement & Financial Overview
              </span>

              {(project.engagement === 'full_time' ||
                project.engagement === 'part_time') && (
                <div className="border-border/50 flex items-center justify-between border-b py-1 last:border-0">
                  <span>Contract Value / Budget</span>
                  <span className="text-foreground font-medium">
                    ${project.contractValue ?? project.contractValue ?? 0}
                  </span>
                </div>
              )}

              {project.engagement === 'retainer' && (
                <>
                  <div className="border-border/50 flex items-center justify-between border-b py-1">
                    <span>Bucket Hours</span>
                    <span className="text-foreground font-medium">
                      {project.retainerHours ?? project.retainerHours ?? 0} hrs
                    </span>
                  </div>
                  <div className="border-border/50 flex items-center justify-between border-b py-1">
                    <span>Billing Period</span>
                    <span className="text-foreground font-medium capitalize">
                      {project.retainerPeriod ??
                        project.retainerPeriod ??
                        'N/A'}
                    </span>
                  </div>
                  <div className="border-border/50 flex items-center justify-between border-b py-1">
                    <span>Retainer Amount</span>
                    <span className="text-foreground font-medium">
                      ${project.retainerAmount ?? project.retainerAmount ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>Overage Multiplier</span>
                    <span className="text-foreground font-medium">
                      {project.retainerOverage ?? project.retainerOverage ?? 1}x
                    </span>
                  </div>
                </>
              )}

              {project.engagement === 'fixed' && (
                <>
                  <div className="border-border/50 flex items-center justify-between border-b py-1">
                    <span>Fixed Fee</span>
                    <span className="text-foreground font-medium">
                      ${project.contractValue ?? project.contractValue ?? 0}
                    </span>
                  </div>
                  {project.estimatedHour && (
                    <div className="flex items-center justify-between py-1">
                      <span>Estimated Scope</span>
                      <span className="text-foreground font-medium">
                        {project.estimatedHour}
                        hrs
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </FxSheetBody>

          <FxSheetFooter>
            <FxButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </FxButton>
            <FxButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </FxButton>
          </FxSheetFooter>
        </form>
      </FxSheetContent>
    </Sheet>
  )
}
