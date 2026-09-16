export interface AllocationFormValues {
  userId: string
  memberName: string
  preset: string
  hoursPerDay: number
  daysPerWk: number
  /**
   * Optional because it is seeded from `memberships.default_rate`, which is null until
   * someone sets it. Defaulting to a number here is what produced the old hardcoded $120 —
   * an empty field is honest, a made-up rate is not.
   */
  rate?: number
  effectiveFrom: string
}

export interface NewProjectFormValues {
  projectName: string
  selectedStartFrom: string
  selectedClient?: string
  targetDate?: Date
  selectedEngagement: string
  budget?: string
  fixedPrice?: string
  estimatedHours?: string
  retainerBucketHours?: string
  retainerBillingPeriod?: string
  retainerAmount?: string
  retainerOverageRate?: string
  brief?: string
  overrideReason?: string
  allocations: AllocationFormValues[]
}

export const START_FROM_OPTIONS = [
  'Blank project',
  'Website build',
  'Brand identity',
  'Marketing campaign',
]
export const ENGAGEMENT_MODELS = [
  {
    id: 'full_time',
    title: 'Full-time',
    subtitle: '8 h/day committed',
    colorClass: 'bg-primary',
    borderClass: 'border-primary',
    ringClass: 'ring-primary',
    softBgClass: 'bg-primary/10 hover:bg-primary/10!',
  },
  {
    id: 'part_time',
    title: 'Part-time',
    subtitle: 'Any fraction of a day',
    colorClass: 'bg-info',
    borderClass: 'border-info',
    ringClass: 'ring-info',
    softBgClass: 'bg-info/10 hover:bg-info/10!',
  },
  {
    id: 'retainer',
    title: 'Retainer',
    subtitle: 'A monthly bucket of hours',
    colorClass: 'bg-warning',
    borderClass: 'border-warning',
    ringClass: 'ring-warning',
    softBgClass: 'bg-warning/10 hover:bg-warning/10!',
  },
  {
    id: 'fixed',
    title: 'Fixed price',
    subtitle: 'Set fee hours tracked, not billed',
    colorClass: 'bg-success',
    borderClass: 'border-success',
    ringClass: 'ring-success',
    softBgClass: 'bg-success/10 hover:bg-success/10!',
  },
]
