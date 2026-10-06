export interface LogTimeMilestone {
  id: string
  title: string
}

export interface LogTimeProject {
  id: string
  name: string
  milestones: LogTimeMilestone[]
  /** Approved minutes on the project - every teammate's for staff, only yours otherwise. */
  approvedMinutes: number
  /** `estimated_hours` for fixed work, `retainer_hours` (per period) for a retainer. */
  plannedHours: number | null
}

export interface LogTimeWeekDay {
  /** ISO date, in the user's zone. */
  date: string
  /** "Mon" ... "Fri". */
  label: string
  minutes: number
  isToday: boolean
  isFuture: boolean
}

export interface LogTimeRecentEntry {
  projectId: string
  projectName: string
  milestoneId: string | null
  milestoneTitle: string | null
  description: string
}

export interface LogTimePageData {
  projects: LogTimeProject[]
  week: LogTimeWeekDay[]
  /** Everything logged this week (Mon-Sun), rejected entries excluded. */
  weekTotalMinutes: number
  recent: LogTimeRecentEntry[]
  /** Today in the user's zone - the default work date. */
  today: string
  /** Admins and managers can read every teammate's entries; contributors only their own. */
  seesAllHours: boolean
}
