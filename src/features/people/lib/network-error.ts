/**
 * Shown when a server action throws instead of returning `{ ok: false }` — the request
 * never got an answer (offline, server restarting mid-deploy).
 */
export const NETWORK_ERROR =
  'Could not reach the server. Check your connection and try again.'
