'use server'

import { getWorkspace, isAdminRole } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ActionResult } from '../onboarding/types'
import { NON_INVOICEABLE_STATUSES } from './constants'
import { buildInvoiceDraft } from './queries/get-invoice'
import { getProjectsData } from './queries/get-projects'
import { createMilestoneSchema } from './schema'
import { CreateDeliveryInput, UpdateProjectInput } from './types'
import {
  CreateMilestoneInput,
  MilestoneItem,
  UpdateMilestoneParams,
} from './types/milestone'

const MINIMUM_CHARGE: Record<string, number> = {
  USD: 0.5,
  EUR: 0.5,
  GBP: 0.3,
  INR: 0.5,
  AUD: 0.5,
  CAD: 0.5,
}

const DEFAULT_MINIMUM_CHARGE = 0.5

const createInvoiceSchema = z.object({
  projectId: z.uuid('Invalid project ID'),
  orgSlug: z.string().min(1, 'Organization slug is required'),
  notes: z.string().max(1000, 'Notes are too long').optional(),
})

export async function createInvoiceAction(
  rawParams: unknown
): Promise<ActionResult<{ invoiceId: string }>> {
  const parsed = createInvoiceSchema.safeParse(rawParams)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const { projectId, orgSlug, notes } = parsed.data

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }

  const isAdmin = await isAdminRole(workspace.role)
  if (!isAdmin) {
    return {
      ok: false,
      error: 'Unauthorized: Only administrators can generate invoices.',
    }
  }

  const draft = await buildInvoiceDraft(projectId, orgSlug)
  if (!draft) {
    return { ok: false, error: 'Project not found in this organization.' }
  }

  if (NON_INVOICEABLE_STATUSES.has(draft.status)) {
    return {
      ok: false,
      error: `This project is ${draft.status} and can no longer be invoiced.`,
    }
  }

  if (draft.unratedNames.length > 0) {
    return {
      ok: false,
      error: `No rate in effect for ${draft.unratedNames.join(', ')}. Set a rate on the project allocation covering those dates, then try again.`,
    }
  }

  if (draft.lines.length === 0) {
    return {
      ok: false,
      error:
        'Nothing to invoice there are no approved, unbilled hours for this project.',
    }
  }

  if (draft.amount <= 0) {
    return {
      ok: false,
      error:
        draft.engagement === 'fixed'
          ? 'This project has no fixed price set, so the invoice would be $0. Set a contract value first.'
          : 'The invoice total is $0. Check the project’s engagement terms before billing.',
    }
  }

  const minimumCharge = MINIMUM_CHARGE[draft.currency] ?? DEFAULT_MINIMUM_CHARGE

  if (draft.amount < minimumCharge) {
    return {
      ok: false,
      error: `The total is below the ${draft.currency} ${minimumCharge} minimum a card payment can process. Bill this alongside other work instead.`,
    }
  }

  const supabase = await createClient()

  const { data: invoiceId, error: rpcError } = await supabase.rpc(
    'create_invoice_with_entries',
    {
      invoice_data: {
        org_id: draft.orgId,
        project_id: draft.projectId,
        amount: draft.amount,
        currency: draft.currency,
        description: notes?.trim() || null,
        status: 'due',
        due_date: draft.dueDate,

        period_start: draft.periodStart,
        period_end: draft.periodEnd,
        lines: draft.lines.map((line) => ({
          description: line.description,
          type_label: line.typeLabel,
          quantity: line.quantityValue ?? null,
          unit_rate: line.unitRateValue ?? null,
          amount: line.amount,
        })),
      },
      entry_ids: draft.entryIds,
    }
  )

  if (rpcError || !invoiceId) {
    console.error('create_invoice_with_entries RPC error:', rpcError?.message)

    return {
      ok: false,
      error: rpcError?.message ?? 'Failed to generate invoice.',
    }
  }

  revalidatePath(`/${orgSlug}/projects/${projectId}`)
  revalidatePath(`/${orgSlug}`)
  revalidatePath(`/${orgSlug}/invoices`)

  return { ok: true, data: { invoiceId } }
}

const endAllocationSchema = z.object({
  allocationId: z.uuid('Invalid allocation ID'),
  projectId: z.uuid('Invalid project ID'),
  orgSlug: z.string().min(1, 'Organization slug is required'),
  /** `YYYY-MM-DD`. The last day the booking runs, not the day after. */
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
})

export async function endAllocationAction(
  rawParams: unknown
): Promise<ActionResult> {
  const parsed = endAllocationSchema.safeParse(rawParams)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const { allocationId, projectId, orgSlug, effectiveTo } = parsed.data

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }

  const isAdmin = await isAdminRole(workspace.role)
  if (!isAdmin) {
    return {
      ok: false,
      error: 'Unauthorized: Only administrators can change allocations.',
    }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('project_allocations')
    .update({ effective_to: effectiveTo })
    .eq('id', allocationId)
    .eq('project_id', projectId)

  if (error) {
    console.error('endAllocationAction error:', error.message)
    return {
      ok: false,
      error:
        'Could not end this allocation. The end date must be on or after the start date.',
    }
  }

  revalidatePath(`/${orgSlug}/projects/${projectId}`)
  return { ok: true }
}

export async function createMilestone(input: CreateMilestoneInput) {
  // 1. Validate payload with Zod on the server
  const validated = createMilestoneSchema.parse({
    title: input.title,
    dueDate: input.dueDate,
  })
  const workspace = await getWorkspace(input.orgSlug)
  if (!workspace || !isAdminRole(workspace.role)) {
    throw new Error('Unauthorized')
  }

  const supabase = await createClient()

  // 2. Verify that the target project belongs to the current workspace
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', input.projectId)
    .eq('org_id', workspace.id)
    .single()

  if (projErr || !project) {
    throw new Error('Project not found or unauthorized')
  }

  // 3. Insert record into Supabase "milestones" table
  const { data: newMilestone, error } = await supabase
    .from('milestones')
    .insert({
      project_id: input.projectId,
      title: validated.title,
      due_date: validated.dueDate,
      status: input.status ?? 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('Supabase error creating milestone:', error)
    throw new Error(error.message || 'Failed to create milestone')
  }

  revalidatePath(`/${input.orgSlug}/projects/${input.projectId}`)
  return newMilestone
}

export async function submitDeliveryForApproval(
  deliveryId: string,
  projectId: string,
  orgSlug: string
) {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    throw new Error('Unauthorized')
  }

  const supabase = await createClient()

  const { data: delivery, error: fetchErr } = await supabase
    .from('deliveries')
    .select('id, project:projects!inner(id, org_id)')
    .eq('id', deliveryId)
    .eq('project_id', projectId)
    .eq('project.org_id', workspace.id)
    .maybeSingle()

  if (fetchErr || !delivery) {
    throw new Error('Delivery not found or access denied')
  }

  const { error } = await supabase
    .from('deliveries')
    .update({ status: 'submitted' })
    .eq('id', deliveryId)
    .eq('status', 'pending')

  if (error) {
    console.error('Failed to submit delivery:', error)
    throw new Error('Failed to update delivery status.')
  }

  revalidatePath(`/${orgSlug}/projects/${projectId}`)
  return { success: true }
}

export async function postUpdateAction(
  projectId: string,
  body: string,
  orgSlug: string
) {
  if (!body.trim()) return

  const supabase = await createClient()

  // Derive authorId from the authenticated server session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  await createProjectUpdate({
    projectId,
    authorId: user.id, // Securely set by server session
    body,
  })

  revalidatePath(`/${orgSlug}/projects/${projectId}`)
}

export async function fetchProjectsAction(
  orgSlug: string,
  allocatedProject: boolean,
  page?: number,
  pageSize?: number
) {
  return await getProjectsData({ orgSlug, page, pageSize, allocatedProject })
}

export async function uploadDeliveryAssets(
  projectId: string,
  deliveryId: string,
  files: File[],
  orgSlug: string
) {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) throw new Error('Unauthorized')

  const supabase = await createClient()
  const bucketName = 'deliverables'

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', workspace.id)
    .single()

  if (projErr || !project) {
    throw new Error('Project not found or unauthorized')
  }

  for (const file of files) {
    // Path structure matches RLS expectations: {org_id}/{project_id}/{filename}
    const filePath = `${workspace.id}/${projectId}/${Date.now()}-${file.name}`

    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (storageError) throw storageError

    const { error: dbError } = await supabase.from('delivery_assets').insert({
      delivery_id: deliveryId,
      file_path: filePath,
    })

    if (dbError) throw dbError
  }
  return { ok: true }
}

export async function createDelivery(input: CreateDeliveryInput) {
  const workspace = await getWorkspace(input.orgSlug)
  if (!workspace) {
    throw new Error('Unauthorized')
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', input.projectId)
    .eq('org_id', workspace.id)
    .single()

  if (projErr || !project) {
    throw new Error('Project not found or unauthorized')
  }

  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      project_id: input.projectId,
      org_id: workspace.id,
      author_id: user.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      milestone_id: input.milestoneId || null,
      due_date: input.dueDate,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating delivery:', error)
    throw new Error('Failed to create delivery.')
  }

  if (input.milestoneId) {
    const { data: milestone } = await supabase
      .from('milestones')
      .select('status')
      .eq('id', input.milestoneId)
      .single()

    if (milestone && milestone.status === 'pending') {
      const { error: milestoneUpdateErr } = await supabase
        .from('milestones')
        .update({ status: 'in_progress' })
        .eq('id', input.milestoneId)

      if (milestoneUpdateErr) {
        console.error('Error updating milestone status:', milestoneUpdateErr)
      }
    }
  }

  revalidatePath(`/${workspace.slug}/projects/${input.projectId}`)
  return { success: true, data }
}

async function createProjectUpdate({
  projectId,
  authorId,
  body,
}: {
  projectId: string
  authorId: string
  body: string
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('updates')
    .insert({
      project_id: projectId,
      author_id: authorId,
      body,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating update:', error)
    throw new Error('Failed to post project update')
  }

  return data
}

export async function updateMilestoneWithValidation({
  milestoneId,
  projectId,
  title,
  dueDate,
  status,
}: UpdateMilestoneParams): Promise<MilestoneItem> {
  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('start_date, due_date, created_at')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    throw new Error('Failed to retrieve project details for validation.')
  }

  const projectStartDate = project.start_date
    ? new Date(project.start_date).toISOString().split('T')[0]
    : new Date(project.created_at).toISOString().split('T')[0]

  const projectEndDate = project.due_date
    ? new Date(project.due_date).toISOString().split('T')[0]
    : null

  if (dueDate) {
    if (projectStartDate && dueDate < projectStartDate) {
      throw new Error(
        `Due date must be on or after the project start date (${projectStartDate}).`
      )
    }

    if (projectEndDate && dueDate > projectEndDate) {
      throw new Error(
        `Due date must be on or before the project due date (${projectEndDate}).`
      )
    }
  }

  if (status === 'completed') {
    const { data: deliverables, error: deliveriesError } = await supabase
      .from('deliveries')
      .select('id, status')
      .eq('milestone_id', milestoneId)

    if (deliveriesError) {
      throw new Error('Failed to verify milestone deliverables.')
    }

    if (deliverables && deliverables.length > 0) {
      const hasUnapproved = deliverables.some((d) => d.status !== 'approved')
      if (hasUnapproved) {
        throw new Error(
          'Cannot complete milestone: All associated deliverables must be approved first.'
        )
      }
    }
  }

  const { data: updatedMilestone, error: updateError } = await supabase
    .from('milestones')
    .update({
      title,
      due_date: dueDate || null,
      status,
    })
    .eq('id', milestoneId)
    .select()
    .single()

  if (updateError || !updatedMilestone) {
    throw new Error(updateError?.message || 'Failed to update milestone.')
  }

  return {
    ...updatedMilestone,
    projectId: updatedMilestone.project_id,
  } as MilestoneItem
}

export async function updateProjectWithValidation(input: UpdateProjectInput) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized. Please log in again.')
  }

  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error('Project name cannot be empty.')
  }

  if (input.status === 'completed') {
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('engagement, contract_value, retainer_amount')
      .eq('id', input.projectId)
      .single()

    if (projError || !project) {
      throw new Error('Project not found for completion validation.')
    }

    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('amount, status')
      .eq('project_id', input.projectId)

    if (invError) {
      throw new Error('Failed to verify project invoices.')
    }

    const invoiceList = invoices || []

    const hasUnpaidInvoices = invoiceList.some((inv) => inv.status !== 'paid')
    if (hasUnpaidInvoices) {
      throw new Error(
        'Cannot complete project: all associated invoices must be paid.'
      )
    }

    const totalInvoiceAmount = invoiceList.reduce(
      (sum, inv) => sum + (Number(inv.amount) || 0),
      0
    )

    const requiresFullValue = ['full_time', 'part_time', 'fixed'].includes(
      project.engagement
    )

    if (requiresFullValue) {
      const requiredValue = Number(project.contract_value) || 0

      if (totalInvoiceAmount < requiredValue) {
        throw new Error(
          `Cannot complete project: Total invoiced amount ($${totalInvoiceAmount}) must meet or exceed the contract value ($${requiredValue}).`
        )
      }
    }
  }

  const { data: updatedProject, error: updateError } = await supabase
    .from('projects')
    .update({
      name: trimmedName,
      description: input.description?.trim() || null,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.projectId)
    .select()
    .single()

  if (updateError) {
    console.error('Error updating project:', updateError)
    throw new Error(updateError.message || 'Failed to update project.')
  }

  revalidatePath(`/${input.orgSlug}/projects/${input.projectId}`)

  return updatedProject
}
