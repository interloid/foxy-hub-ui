/**
 * "Language" — Settings → General. Regional formats only: the text stays English, and
 * the choice decides how dates and times are written (23 Sept 2026 vs Sep 23, 2026;
 * 13:34 vs 1:34 PM; 23/09/2026 vs 09/23/2026).
 *
 * Stored in `user_preferences.locale` (a CHECK constraint allows only LOCALES). No row
 * means DEFAULT_LOCALE, so existing accounts need no backfill.
 *
 * Weeks still start on Monday whatever the locale: timesheet weeks and approvals are
 * built on it (see startOfWeekIn in lib/date.ts).
 */

export const LOCALES = ['en-GB', 'en-US'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en-GB'

export const LOCALE_LABELS: Record<Locale, string> = {
  'en-GB': 'English (United Kingdom)',
  'en-US': 'English (United States)',
}

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
  )
}
