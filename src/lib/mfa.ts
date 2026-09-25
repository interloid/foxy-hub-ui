import type { User } from '@supabase/supabase-js'

/**
 * Two-factor authentication (authenticator app / TOTP) — opt-in per user from Settings →
 * Security. Supabase only records WHETHER a session passed the code (its `aal` claim:
 * aal1 = password or email link, aal2 = code too). Asking for the code and refusing an
 * aal1 session is the app's job: proxy.ts sends any aal1 session of a user with a verified
 * factor to MFA_VERIFY_PATH, whatever route it asked for.
 */

export const MFA_VERIFY_PATH = '/sign-in/verify'

export const MFA_CODE_LENGTH = 6

/** A verified authenticator on the account — `user.factors` from `getUser()`. */
export function hasVerifiedFactor(user: Pick<User, 'factors'> | null): boolean {
  return Boolean(user?.factors?.some((factor) => factor.status === 'verified'))
}

// Re-exported so the 2FA code keeps importing it from here.
export { safeNextPath } from './safe-redirect'
