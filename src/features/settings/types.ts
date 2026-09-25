export interface WorkspaceSettings {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  dailyCapacityHours: number
  daysPerWeek: number
  currency: string
  roundingMinutes: number
  canEdit: boolean
  seatsUsed: number
  seatsTotal: number | null
  pendingInvites: number
}

export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'unknown'

/** One signed-in session, as the Devices list in Settings → Security shows it. */
export interface DeviceSession {
  sessionId: string
  /** "Chrome on macOS", or "Unknown device" when no details were recorded. */
  name: string
  kind: DeviceKind
  /** "Chennai, IN", or null when unknown (always, locally — no geo headers). */
  location: string | null
  createdAt: string
  lastSeenAt: string
  isCurrent: boolean
}
