'use server'

import { issueInvoiceAction } from '@/features/portal/actions'
import { actorNameOf, logActivity, type ActivityChange } from '@/lib/activity'
import {
  getFormatter,
  getUserLocale,
  getWorkspace,
  isAdminRole,
  verifySession,
} from '@/lib/dal'
import { demoBlocked } from '@/lib/demo'
import { isBillingRole } from '@/lib/role'
import { formatCurrency } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ActionResult } from '../onboarding/types'
import { NON_INVOICEABLE_STATUSES, PROJECT_STATUS_CONFIG } from './constants'
import { buildInvoiceDraft } from './queries/get-invoice'
import { getProjectsData } from './queries/get-projects'
import { createMilestoneSchema } from './schema'
import {
  CreateDeliveryInput,
  DeliveryStatus,
  ProjectStatus,
  UpdateProjectInput,
} from './types'
import {
  CreateMilestoneInput,
  MilestoneItem,
  UpdateMilestoneParams,
} from './types/milestone'

const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
}

const MILESTONE_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
}

const projectStatusLabel = (status: string) =>
  PROJECT_STATUS_CONFIG[status as ProjectStatus]?.label ?? status

/** An update's body as the feed quotes it - one line, cut at a word. */
function excerpt(text: string, max = 140) {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= max) return line
  return `${line.slice(0, max).replace(/\s+\S*$/, '')}...`
}

const MINIMUM_CHARGE: Record<string, number> = {
  USD: 0.5,
  EUR: 0.5,
  GBP: 0.3,
  INR: 0.5,
}

const DEFAULT_MINIMUM_CHARGE = 0.5

const createInvoiceSchema = z.object({
  projectId: z.uuid('Invalid project ID'),
  orgSlug: z.string().min(1, 'Organization slug is required'),
  notes: z.string().max(1000, 'Notes are too long').optional(),
  /** Retainers: the start of the period to bill. Omitted, the latest unbilled one. */
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid billing period')
    .nullish(),
})

export async function createInvoiceAction(rawParams: unknown): Promise<
  ActionResult<{
    invoiceId: string
    /** False when Stripe refused — the invoice exists but has no payable link yet. */
    issued: boolean
    paymentUrl: string | null
  }>
> {
  const parsed = createInvoiceSchema.safeParse(rawParams)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const { projectId, orgSlug, notes, periodStart } = parsed.data

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }

  // isBillingRole, NOT isAdminRole: `manager` is an admin role for everything
  // except billing, and `create_invoice_with_entries` refuses it with 42501. A
  // check here that were wider than the RPC's would turn that into a raw
  // database error instead of this message.
  if (!isBillingRole(workspace.role)) {
    return {
      ok: false,
      error:
        'Unauthorized: Only a primary admin or admin can generate invoices.',
    }
  }

  const draft = await buildInvoiceDraft(projectId, orgSlug, periodStart)
  if (!draft) {
    return { ok: false, error: 'Project not found in this organization.' }
  }

  if (NON_INVOICEABLE_STATUSES.has(draft.status)) {
    return {
      ok: false,
      error: `This project is ${draft.status} and can no longer be invoiced.`,
    }
  }

  if (draft.periodError) {
    return { ok: false, error: draft.periodError }
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
    const zero = formatCurrency(0, draft.currency, {
      locale: await getUserLocale(),
    })

    return {
      ok: false,
      error:
        draft.engagement === 'fixed'
          ? `This project has no fixed price set, so the invoice would be ${zero}. Set a contract value first.`
          : `The invoice total is ${zero}. Check the project’s engagement terms before billing.`,
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

    // invoices_project_period_key: someone billed this period since the sheet opened.
    if (rpcError?.code === '23505' && draft.periodStart) {
      return {
        ok: false,
        error: 'This billing period has already been invoiced.',
      }
    }

    return {
      ok: false,
      error: rpcError?.message ?? 'Failed to generate invoice.',
    }
  }

  /**
   * Issue it with Stripe straight away, so the invoice exists as a document the moment the
   * app says it was raised — with a due date, a PDF and a payable link.
   *
   * Deliberately NOT fatal. The row is committed and the hours are claimed; a Stripe
   * outage must not roll that back or report a failure for work that was billed. The
   * invoice simply has no `invoice_url` until someone retries, and `issueInvoiceAction` is
   * safe to call again for exactly that.
   */
  // The demo workspace keeps the invoice in the app only: issuing it would create a real
  // Stripe invoice and email the client.
  const issued = workspace.isDemo ? null : await issueInvoiceAction(invoiceId)

  if (issued && !issued.ok) {
    console.error(`invoice ${invoiceId} saved but not issued:`, issued.error)
  }

  const session = await verifySession()
  if (session) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('id', invoiceId)
      .maybeSingle()
    const number = invoice?.invoice_number || 'an invoice'

    await logActivity(supabase, {
      orgId: draft.orgId,
      actorId: session.id,
      actorKind: 'member',
      type: 'invoice_created',
      summary: `${await actorNameOf(supabase, session.id)} raised ${number} for ${formatCurrency(draft.amount, draft.currency)} on ${draft.projectName}`,
      projectId: draft.projectId,
      entityType: 'invoice',
      entityId: invoiceId,
      payload: {
        invoice_number: invoice?.invoice_number ?? null,
        amount: draft.amount,
        currency: draft.currency,
      },
      note: notes,
    })
  }

  revalidatePath(`/${orgSlug}/projects/${projectId}`)
  revalidatePath(`/${orgSlug}`)
  revalidatePath(`/${orgSlug}/invoices`)

  return {
    ok: true,
    data: {
      invoiceId,
      issued: issued?.ok ?? false,
      paymentUrl: issued?.ok ? issued.data.url : null,
    },
  }
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
    .select('id, name')
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

  const session = await verifySession()
  if (session) {
    const fmt = await getFormatter()
    await logActivity(supabase, {
      orgId: workspace.id,
      actorId: session.id,
      actorKind: 'member',
      type: 'milestone_created',
      summary: `${await actorNameOf(supabase, session.id)} added milestone ${newMilestone.title} to ${project.name}`,
      projectId: input.projectId,
      entityType: 'milestone',
      entityId: newMilestone.id,
      note: newMilestone.due_date
        ? `Due ${fmt.date(newMilestone.due_date, 'date')}`
        : null,
    })
  }

  revalidatePath(`/${input.orgSlug}/projects/${input.projectId}`)
  return newMilestone
}

export async function approveDeliveryAction(
  deliveryId: string,
  projectId: string,
  orgSlug: string
): Promise<ActionResult> {
  const supabase = await createClient()

  // For the feed's "Status  Submitted -> Approved" - the RPC doesn't say what it replaced.
  const { data: before } = await supabase
    .from('deliveries')
    .select('status')
    .eq('id', deliveryId)
    .maybeSingle()

  const { error } = await supabase.rpc('update_delivery_status', {
    p_status: 'approved',
    p_delivery_id: deliveryId,
    p_project_id: projectId,
  })

  if (error) {
    console.error('Failed to approve delivery:', error.message)
    return { ok: false, error: 'Could not approve this deliverable.' }
  }

  await logDeliveryApproved(deliveryId, before?.status ?? null)

  // Both places a client can be looking at it from.
  revalidatePath(`/portal/${orgSlug}/projects/${projectId}`)
  revalidatePath(`/portal/${orgSlug}`)
  return { ok: true }
}

/**
 * Only the project's client can approve, and `activity_events` admits staff writers only -
 * so this one event is written with the service role, like the Stripe webhook's. The
 * approval has already succeeded; a failure here is logged, never surfaced.
 */
async function logDeliveryApproved(
  deliveryId: string,
  previousStatus: DeliveryStatus | null
) {
  const session = await verifySession()
  if (!session) return

  try {
    const admin = createAdminClient()
    const { data: delivery } = await admin
      .from('deliveries')
      .select('id, title, org_id, project_id')
      .eq('id', deliveryId)
      .maybeSingle()
    if (!delivery) return

    await logActivity(admin, {
      orgId: delivery.org_id,
      actorId: session.id,
      actorKind: 'client',
      type: 'delivery_approved',
      summary: `${await actorNameOf(admin, session.id)} approved ${delivery.title}`,
      projectId: delivery.project_id,
      entityType: 'delivery',
      entityId: delivery.id,
      changes: [
        {
          label: 'Status',
          from: previousStatus ? DELIVERY_STATUS_LABEL[previousStatus] : null,
          to: DELIVERY_STATUS_LABEL.approved,
        },
      ],
    })
  } catch (err) {
    console.error('delivery_approved activity failed:', (err as Error).message)
  }
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
    .select('id, title, project:projects!inner(id, org_id)')
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

  const session = await verifySession()
  if (session) {
    await logActivity(supabase, {
      orgId: workspace.id,
      actorId: session.id,
      actorKind: 'member',
      type: 'delivery_submitted',
      summary: `${await actorNameOf(supabase, session.id)} sent ${delivery.title} for client sign-off`,
      projectId,
      entityType: 'delivery',
      entityId: deliveryId,
      // The update above only matches a pending delivery, so that is what it was.
      changes: [
        {
          label: 'Status',
          from: DELIVERY_STATUS_LABEL.pending,
          to: DELIVERY_STATUS_LABEL.submitted,
        },
      ],
    })
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

  const update = await createProjectUpdate({
    projectId,
    authorId: user.id, // Securely set by server session
    body,
  })

  const { data: project } = await supabase
    .from('projects')
    .select('org_id, name')
    .eq('id', projectId)
    .maybeSingle()

  if (project) {
    await logActivity(supabase, {
      orgId: project.org_id,
      actorId: user.id,
      actorKind: 'member',
      type: 'update_posted',
      summary: `${await actorNameOf(supabase, user.id)} posted an update on ${project.name}`,
      projectId,
      entityType: 'update',
      entityId: update.id,
      note: excerpt(body),
    })
  }

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
  // Files would be public to every demo visitor and outlive the hourly reset.
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) throw new Error('Unauthorized')

  const supabase = await createClient()
  const bucketName = 'deliverables'

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name')
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

  const session = await verifySession()
  if (session && files.length > 0) {
    const what = files.length === 1 ? files[0]!.name : `${files.length} files`
    await logActivity(supabase, {
      orgId: workspace.id,
      actorId: session.id,
      actorKind: 'member',
      type: 'asset_uploaded',
      summary: `${await actorNameOf(supabase, session.id)} uploaded ${what} to ${project.name}`,
      projectId,
      entityType: 'delivery',
      entityId: deliveryId,
      payload: { file_names: files.map((f) => f.name) },
    })
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
    .select('id, name')
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

  await logActivity(supabase, {
    orgId: workspace.id,
    actorId: user.id,
    actorKind: 'member',
    type: 'delivery_created',
    summary: `${await actorNameOf(supabase, user.id)} added ${data.title} to ${project.name}`,
    projectId: input.projectId,
    entityType: 'delivery',
    entityId: data.id,
  })

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
    .select('org_id, name, start_date, due_date, created_at')
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

  // Read before the update, so the feed records what actually changed - and only says
  // "completed" on the change itself.
  const { data: before } = await supabase
    .from('milestones')
    .select('status, title, due_date')
    .eq('id', milestoneId)
    .maybeSingle()

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

  if (before) {
    const fmt = await getFormatter()
    const statusLabel = (value: string) =>
      MILESTONE_STATUS_LABEL[value] ?? value
    const dueLabel = (value: string | null) =>
      value ? fmt.date(value, 'date') : 'No date'

    const changes: ActivityChange[] = []
    if (before.title !== updatedMilestone.title) {
      changes.push({
        label: 'Title',
        from: before.title,
        to: updatedMilestone.title,
      })
    }
    if ((before.due_date ?? null) !== (updatedMilestone.due_date ?? null)) {
      changes.push({
        label: 'Due date',
        from: before.due_date ? dueLabel(before.due_date) : null,
        to: dueLabel(updatedMilestone.due_date),
      })
    }
    if (before.status !== updatedMilestone.status) {
      changes.push({
        label: 'Status',
        from: statusLabel(before.status),
        to: statusLabel(updatedMilestone.status),
      })
    }

    const completedNow =
      updatedMilestone.status === 'completed' && before.status !== 'completed'
    const session = changes.length > 0 ? await verifySession() : null
    if (session) {
      const actor = await actorNameOf(supabase, session.id)
      await logActivity(supabase, {
        orgId: project.org_id,
        actorId: session.id,
        actorKind: 'member',
        type: completedNow ? 'milestone_completed' : 'milestone_updated',
        summary: completedNow
          ? `${actor} completed ${updatedMilestone.title} on ${project.name}`
          : `${actor} updated milestone ${updatedMilestone.title} on ${project.name}`,
        projectId,
        entityType: 'milestone',
        entityId: milestoneId,
        changes,
      })
    }
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

    // A voided invoice is neither owed nor billed, so it neither blocks completion nor
    // counts toward the contract value.
    const invoiceList = (invoices || []).filter(
      (inv) => inv.status !== 'cancelled'
    )

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

    // Only a fixed fee has to be invoiced in full before completing. Budget-based treats
    // `contract_value` as a cap, so a project that came in under budget can still close.
    const requiresFullValue = project.engagement === 'fixed'

    if (requiresFullValue) {
      const requiredValue = Number(project.contract_value) || 0

      if (totalInvoiceAmount < requiredValue) {
        throw new Error(
          `Cannot complete project: Total invoiced amount ($${totalInvoiceAmount}) must meet or exceed the contract value ($${requiredValue}).`
        )
      }
    }
  }

  // What it was, so the feed can show "Status  Pending -> In Progress".
  const { data: previous } = await supabase
    .from('projects')
    .select('org_id, name, status, description')
    .eq('id', input.projectId)
    .maybeSingle()

  const clientPatch: { client_org_id?: string } = {}

  if (input.clientOrgId) {
    const { data: current, error: currentError } = await supabase
      .from('projects')
      .select('client_org_id')
      .eq('id', input.projectId)
      .single()

    if (currentError || !current) {
      throw new Error('Project not found.')
    }

    if (current.client_org_id && current.client_org_id !== input.clientOrgId) {
      throw new Error(
        'This project already has a client. Clients cannot be changed once set.'
      )
    }

    if (!current.client_org_id) {
      clientPatch.client_org_id = input.clientOrgId
    }
  }

  const { data: updatedProject, error: updateError } = await supabase
    .from('projects')
    .update({
      name: trimmedName,
      description: input.description?.trim() || null,
      status: input.status,
      ...clientPatch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.projectId)
    .select()
    .single()

  if (updateError) {
    console.error('Error updating project:', updateError)
    throw new Error(updateError.message || 'Failed to update project.')
  }

  if (previous) {
    const changes: ActivityChange[] = []
    if (previous.name !== trimmedName) {
      changes.push({ label: 'Name', from: previous.name, to: trimmedName })
    }
    if (previous.status !== input.status) {
      changes.push({
        label: 'Status',
        from: projectStatusLabel(previous.status),
        to: projectStatusLabel(input.status),
      })
    }
    if (clientPatch.client_org_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('name')
        .eq('id', clientPatch.client_org_id)
        .maybeSingle()
      changes.push({
        label: 'Client',
        from: null,
        to: client?.name || 'Client',
      })
    }
    const descriptionChanged =
      (previous.description ?? '') !== (input.description?.trim() ?? '')

    if (changes.length > 0 || descriptionChanged) {
      await logActivity(supabase, {
        orgId: previous.org_id,
        actorId: user.id,
        actorKind: 'member',
        type: 'project_updated',
        summary: `${await actorNameOf(supabase, user.id)} ${descriptionChanged && changes.length === 0 ? 'edited the description of' : 'changed'} ${trimmedName}`,
        projectId: input.projectId,
        entityType: 'project',
        entityId: input.projectId,
        changes,
      })
    }
  }

  revalidatePath(`/${input.orgSlug}/projects/${input.projectId}`)
  // The list shows the client column, so it goes stale when one is attached here.
  revalidatePath(`/${input.orgSlug}/projects`)

  return updatedProject
}
