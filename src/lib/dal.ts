import { UserRole } from '@/features/dashboard/types'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { inactivityTimeoutOf, type InactivityTimeout } from './inactivity'
import {
  shiftISODate,
  startOfDayInstantIn,
  startOfMonthIn,
  todayIn,
} from './date'
import { createFormatter, type Formatter } from './format'
import { initialsOf } from './initials'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale'
import {
  FALLBACK_TIME_ZONE,
  isValidTimeZone,
  TIME_ZONE_COOKIE,
} from './time-zone'
import { isTheme, type Theme } from './theme'
import { isAdminRole, STAFF_ROLES } from './role'
import { createClient } from './supabase/server'

export type SessionUser = {
  id: string
  email: string | null
  pendingEmail: string | null
  inactivityTimeout: InactivityTimeout
  mfaEnabledAt: string | null
  /** When the password was last set or changed; null until first recorded. */
  passwordChangedAt: string | null
}

/** A row of `user_preferences`, with the database defaults filled in when there is none. */
export type UserPreferences = {
  locale: Locale
  /** The manually chosen zone, or null while "Automatic time zone" is on. */
  manualTimeZone: string | null
  /** The zone of the device used most recently — for the weekly digest. */
  lastDeviceTimeZone: string | null
  /** null = never chosen on the account (the browser's local choice is uploaded). */
  theme: Theme | null
  weeklyDigest: boolean
}

const DEFAULT_PREFERENCES: UserPreferences = {
  locale: DEFAULT_LOCALE,
  manualTimeZone: null,
  lastDeviceTimeZone: null,
  theme: null,
  weeklyDigest: false,
}

export type AccountDTO = {
  id: string
  email: string | null
  pendingEmail: string | null
  inactivityTimeout: InactivityTimeout
  mfaEnabledAt: string | null
  passwordChangedAt: string | null
  manualTimeZone: string | null
  locale: Locale
  lastDeviceTimeZone: string | null
  theme: Theme | null
  weeklyDigest: boolean
  fullName: string | null
  avatarUrl: string | null
  role: string | null
  initials: string
  isAdmin: boolean
  orgName: string | undefined
  isMember: boolean
}

export type WorkspaceDTO = {
  id: string
  name: string
  currency: string
  slug: string
  role: UserRole
}

export type DashboardMetricsDTO = {
  openProjects: number
  projectsAddedThisMonth: number
  pendingApprovals: number
  approvalsDueThisWeek: number
  minutesToApprove: number
  timesheetsToApprove: number
  outstandingAmount: number
  overdueInvoices: number
  unpaidInvoices: number
  mrrCents: number
  activeSeats: number
  currency: string
}

export { isAdminRole }

const OPEN_PROJECT_STATUSES = [
  'draft',
  'pending',
  'in-progress',
  'pending-approval',
] as const

export const verifySession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  return {
    id: user.id,
    email: user.email ?? null,
    pendingEmail: user.new_email ?? null,
    inactivityTimeout: inactivityTimeoutOf(user.user_metadata),
    mfaEnabledAt:
      user.factors?.find(
        (factor) =>
          factor.factor_type === 'totp' && factor.status === 'verified'
      )?.created_at ?? null,
    passwordChangedAt: validTimestamp(user.user_metadata?.password_changed_at),
  }
})

/** An ISO timestamp from user_metadata, or null — the key is user-writable, so check it. */
function validTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null
}

/**
 * The signed-in user's `user_preferences` row, cached per request. No row (never saved a
 * preference) and signed-out both give the defaults. Values are validated again here so a
 * bad row can never break formatting.
 */
export const getUserPreferences = cache(async (): Promise<UserPreferences> => {
  const session = await verifySession()
  if (!session) return DEFAULT_PREFERENCES

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_preferences')
    .select('locale, time_zone, last_device_time_zone, theme, weekly_digest')
    .eq('user_id', session.id)
    .maybeSingle()

  if (error) console.error('load preferences failed:', error.message)
  if (!data) return DEFAULT_PREFERENCES

  return {
    locale: isLocale(data.locale) ? data.locale : DEFAULT_LOCALE,
    manualTimeZone: isValidTimeZone(data.time_zone) ? data.time_zone : null,
    lastDeviceTimeZone: isValidTimeZone(data.last_device_time_zone)
      ? data.last_device_time_zone
      : null,
    theme: isTheme(data.theme) ? data.theme : null,
    weeklyDigest: data.weekly_digest,
  }
})

export const getUserTimeZone = cache(async (): Promise<string> => {
  const preferences = await getUserPreferences()
  if (preferences.manualTimeZone) return preferences.manualTimeZone

  const cookieStore = await cookies()
  const deviceZone = cookieStore.get(TIME_ZONE_COOKIE)?.value
  if (isValidTimeZone(deviceZone)) return deviceZone

  const headerList = await headers()
  const ipZone = headerList.get('x-vercel-ip-timezone')
  if (isValidTimeZone(ipZone)) return ipZone

  return FALLBACK_TIME_ZONE
})

/** The signed-in user's regional format, or the default when signed out. */
export const getUserLocale = cache(async (): Promise<Locale> => {
  return (await getUserPreferences()).locale
})

export const getFormatter = cache(async (): Promise<Formatter> =>
  createFormatter(await getUserLocale(), await getUserTimeZone())
)

export const getWorkspace = cache(
  async (slug?: string): Promise<WorkspaceDTO | null> => {
    const session = await verifySession()
    if (!session) return null

    const supabase = await createClient()

    if (slug) {
      const { data, error } = await supabase
        .from('memberships')
        .select('role, organizations!inner(id, name, slug, currency)')
        .eq('user_id', session.id)
        .eq('status', true)
        .eq('organizations.slug', slug)
        .maybeSingle()

      if (error || !data?.organizations) return null

      const org = data.organizations
      return {
        id: org.id,
        name: org.name,
        currency: org.currency,
        slug: org.slug,
        role: data.role as UserRole,
      }
    }

    const { data, error } = await supabase
      .from('memberships')
      .select('role, organizations!inner(id, name, slug, currency)')
      .eq('user_id', session.id)
      .eq('status', true)
      .order('created_at', { ascending: true })
      .limit(1)

    if (error || !data || data.length === 0 || !data[0]?.organizations) {
      return null
    }

    const firstMembership = data[0]
    const org = firstMembership.organizations

    return {
      id: org.id,
      name: org.name,
      currency: org.currency,
      slug: org.slug,
      role: firstMembership.role as UserRole,
    }
  }
)

export const getAccount = cache(
  async (orgSlug?: string): Promise<AccountDTO | null> => {
    const session = await verifySession()
    if (!session) return null

    const supabase = await createClient()
    const workspace = await getWorkspace(orgSlug)

    const [{ data: profile }, preferences] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', session.id)
        .maybeSingle(),
      getUserPreferences(),
    ])

    const role = workspace?.role ?? null

    return {
      id: session.id,
      email: session.email,
      pendingEmail: session.pendingEmail,
      inactivityTimeout: session.inactivityTimeout,
      mfaEnabledAt: session.mfaEnabledAt,
      passwordChangedAt: session.passwordChangedAt,
      manualTimeZone: preferences.manualTimeZone,
      locale: preferences.locale,
      lastDeviceTimeZone: preferences.lastDeviceTimeZone,
      theme: preferences.theme,
      weeklyDigest: preferences.weeklyDigest,
      fullName: (profile?.full_name as string | null) ?? null,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      role,
      initials: initialsOf(
        (profile?.full_name as string | null) ?? null,
        session.email
      ),
      isAdmin: isAdminRole(role),
      orgName: workspace?.name,
      isMember: Boolean(workspace),
    }
  }
)

export const getDashboardMetrics = cache(
  async (orgSlug?: string): Promise<DashboardMetricsDTO | null> => {
    const workspace = await getWorkspace(orgSlug)
    if (!workspace) return null

    const supabase = await createClient()
    const orgId = workspace.id

    const timeZone = await getUserTimeZone()
    const today = todayIn(timeZone)
    const startOfMonth = startOfDayInstantIn(timeZone, startOfMonthIn(timeZone))
    const nextWeek = shiftISODate(today, 7)

    const [
      openProjects,
      addedThisMonth,
      pendingApprovals,
      dueThisWeek,
      submittedEntries,
      unpaidInvoices,
      overdueInvoices,
      subscription,
      seats,
      orgRow,
    ] = await Promise.all([
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('status', OPEN_PROJECT_STATUSES),

      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', startOfMonth),

      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'submitted'),

      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'submitted')
        .gte('due_date', today)
        .lte('due_date', nextWeek),

      supabase
        .from('time_entries')
        .select('duration_minutes, projects!inner(org_id)')
        .eq('status', 'submitted')
        .eq('projects.org_id', orgId),

      supabase
        .from('invoices')
        .select('amount')
        .eq('org_id', orgId)
        .in('status', ['due', 'overdue']),

      supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'overdue'),

      supabase
        .from('subscriptions')
        .select('plans(price_cents, duration_months)')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .maybeSingle(),

      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('role', STAFF_ROLES),

      supabase
        .from('organizations')
        .select('currency')
        .eq('id', orgId)
        .maybeSingle(),
    ])

    const minutes = (submittedEntries.data || []).reduce(
      (acc, r) => acc + (r.duration_minutes || 0),
      0
    )

    const outstanding = (unpaidInvoices.data || []).reduce(
      (acc, r) => acc + (Number(r.amount) || 0),
      0
    )

    const rawPlan = subscription.data?.plans
    const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan
    const mrrCents = plan?.duration_months
      ? Math.round((plan.price_cents || 0) / plan.duration_months)
      : 0

    return {
      openProjects: openProjects.count ?? 0,
      projectsAddedThisMonth: addedThisMonth.count ?? 0,
      pendingApprovals: pendingApprovals.count ?? 0,
      approvalsDueThisWeek: dueThisWeek.count ?? 0,
      minutesToApprove: minutes,
      timesheetsToApprove: (submittedEntries.data || []).length,
      outstandingAmount: outstanding,
      overdueInvoices: overdueInvoices.count ?? 0,
      unpaidInvoices: (unpaidInvoices.data || []).length,
      mrrCents,
      activeSeats: seats.count ?? 0,
      currency: orgRow.data?.currency || 'USD',
    }
  }
)

export const getUnpaidInvoiceCount = cache(
  async (orgSlug?: string): Promise<number> => {
    const workspace = await getWorkspace(orgSlug)
    if (!workspace) return 0

    const supabase = await createClient()
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', workspace.id)
      .in('status', ['due', 'overdue'])

    return count ?? 0
  }
)
