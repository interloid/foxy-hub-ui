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
  selectedClient: string
  targetDate: Date | undefined
  selectedEngagement: string
  budget: string
  brief: string
  overrideReason: string
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
    id: 'full-time',
    title: 'Full-time',
    subtitle: '8 h/day committed',
    colorClass: 'bg-amber-500',
  },
  {
    id: 'part-time',
    title: 'Part-time',
    subtitle: 'Any fraction of a day',
    colorClass: 'bg-blue-500',
  },
  {
    id: 'retainer',
    title: 'Retainer',
    subtitle: 'A monthly bucket of hours',
    colorClass: 'bg-yellow-500',
  },
  {
    id: 'fixed-price',
    title: 'Fixed price',
    subtitle: 'Set fee — hours tracked, not billed',
    colorClass: 'bg-emerald-500',
  },
]
