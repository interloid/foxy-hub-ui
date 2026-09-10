'use server'

import { getWorkspace, isAdminRole } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ActionResult } from '../onboarding/types'
import { createProjectUpdate } from './data'
import { buildInvoiceDraft } from './queries/get-invoice'
import { getProjectsData } from './queries/get-projects'
import { createMilestoneSchema } from './schema'
import { CreateDeliveryInput, CreateMilestoneInput } from './types'

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
        'Nothing to invoice — there are no approved, unbilled hours for this project.',
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

  const supabase = await createClient()

  // 2. Insert record into Supabase "milestones" table
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

  return newMilestone
}

export async function submitDeliveryForApproval(
  deliveryId: string,
  projectId: string
) {
  const supabase = await createClient()

  // 1. Verify user authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized')
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

  revalidatePath(`/projects/${projectId}`)

  return { success: true }
}

export async function postUpdateAction(
  projectId: string,
  authorId: string,
  body: string
) {
  if (!body.trim()) return

  await createProjectUpdate({
    projectId,
    authorId,
    body,
  })

  revalidatePath(`/projects/${projectId}`)
}

export async function fetchProjectsAction(
  orgSlug: string,
  page?: number,
  pageSize?: number
) {
  return await getProjectsData({ orgSlug, page, pageSize })
}

export async function uploadDeliveryAssets(
  orgId: string,
  projectId: string,
  deliveryId: string,
  files: File[],
  bucketName = 'deliverables'
) {
  const supabase = await createClient()

  for (const file of files) {
    // Path structure matches RLS expectations: {org_id}/{project_id}/{filename}
    const filePath = `${orgId}/${projectId}/${Date.now()}-${file.name}`

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
}

export async function createDelivery(input: CreateDeliveryInput) {
  const supabase = await createClient()

  // 1. Get authenticated user ID
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  // 2. Insert into public.deliveries
  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      project_id: input.projectId,
      org_id: input.orgId,
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

  // 3. Revalidate cache
  revalidatePath(`/projects/${input.projectId}`)

  return { success: true, data }
}
