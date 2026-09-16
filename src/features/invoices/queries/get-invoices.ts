import { createClient } from '@/lib/supabase/server'

export interface InvoiceListItem {
  id: string
  number: string
  projectName: string
  clientName: string
  amount: number
  status: 'draft' | 'due' | 'paid' | 'overdue' | 'cancelled'
}

export interface GetInvoicesResponse {
  invoices: InvoiceListItem[]
  totalCount: number
  totalPages: number
  currentPage: number
}

// Internal type shapes for primary database query
interface SupabaseProjectRelation {
  name: string
  client_id: string | null
}

interface SupabaseInvoiceRow {
  id: string
  invoice_number: string | null
  amount: number | string | null
  status: InvoiceListItem['status']
  projects: SupabaseProjectRelation | SupabaseProjectRelation[] | null
}

interface ClientRow {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
}

export async function getInvoices(
  orgId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<GetInvoicesResponse> {
  const supabase = await createClient()

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // 1. Fetch Invoices and joined Project details
  const { data, count, error } = await supabase
    .from('invoices')
    .select(
      `
      id,
      invoice_number,
      amount,
      status,
      projects (
        name,
        client_id
      )
    `,
      { count: 'exact' }
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error || !data) {
    console.error('getInvoices Error:', error)
    return { invoices: [], totalCount: 0, totalPages: 0, currentPage: page }
  }

  const invoiceRows = data as unknown as SupabaseInvoiceRow[]

  // 2. Extract unique client_ids across fetched projects
  const clientIds = Array.from(
    new Set(
      invoiceRows
        .map((inv) => {
          const rawProject = Array.isArray(inv.projects)
            ? inv.projects[0]
            : inv.projects
          return rawProject?.client_id
        })
        .filter((id): id is string => Boolean(id))
    )
  )

  // 3. Batch fetch client details from public.clients in a single database call
  const clientMap = new Map<string, string>()

  if (clientIds.length > 0) {
    const { data: clientsData, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, contact_name, contact_email')
      .in('id', clientIds)
      .eq('org_id', orgId)

    if (!clientsError && clientsData) {
      const clients = clientsData as ClientRow[]
      clients.forEach((client) => {
        const displayName =
          client.name || client.contact_name || client.contact_email || '—'
        clientMap.set(client.id, displayName)
      })
    } else if (clientsError) {
      console.error('Error fetching clients:', clientsError)
    }
  }

  // 4. Map final response
  const invoices: InvoiceListItem[] = invoiceRows.map((inv) => {
    const rawProject = Array.isArray(inv.projects)
      ? inv.projects[0]
      : inv.projects

    const clientId = rawProject?.client_id || null
    const clientName = clientId ? clientMap.get(clientId) || '—' : '—'

    return {
      id: inv.id,
      number: inv.invoice_number || `INV-${inv.id.slice(0, 4)}`,
      projectName: rawProject?.name || '—',
      clientName,
      amount: Number(inv.amount) || 0,
      status: inv.status,
    }
  })

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return {
    invoices,
    totalCount,
    totalPages,
    currentPage: page,
  }
}
