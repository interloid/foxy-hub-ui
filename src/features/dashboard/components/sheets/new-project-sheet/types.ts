export interface AllocationFormValues {
  userId: string
  memberName: string
  preset: string
  hoursPerDay: number
  daysPerWk: number
  rate: number
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
    colorClass: 'bg-amber-500',
    borderClass: 'border-amber-500',
    ringClass: 'ring-amber-500',
    softBgClass: 'bg-amber-500/10 hover:bg-amber-500/10!',
  },
  {
    id: 'part_time',
    title: 'Part-time',
    subtitle: 'Any fraction of a day',
    colorClass: 'bg-blue-500',
    borderClass: 'border-blue-500',
    ringClass: 'ring-blue-500',
    softBgClass: 'bg-blue-500/10 hover:bg-blue-500/10!',
  },
  {
    id: 'retainer',
    title: 'Retainer',
    subtitle: 'A monthly bucket of hours',
    colorClass: 'bg-yellow-500',
    borderClass: 'border-yellow-500',
    ringClass: 'ring-yellow-500',
    softBgClass: 'bg-yellow-500/10 hover:bg-yellow-500/10!',
  },
  {
    id: 'fixed',
    title: 'Fixed price',
    subtitle: 'Set fee — hours tracked, not billed',
    colorClass: 'bg-emerald-500',
    borderClass: 'border-emerald-500',
    ringClass: 'ring-emerald-500',
    softBgClass: 'bg-emerald-500/10 hover:bg-emerald-500/10!',
  },
]
