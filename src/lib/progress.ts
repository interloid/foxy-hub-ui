import { MilestoneStatus } from '@/features/projects/types'

export interface ProgressResult {
  totalCount: number
  completedCount: number
  percentage: number
}
export function calculateMilestoneProgress(
  milestones: {
    status: MilestoneStatus
  }[]
): ProgressResult {
  const totalCount = milestones.length

  const completedCount = milestones.filter(
    (m) => m.status === 'completed'
  ).length

  const weightedProgress = milestones.reduce((acc, m) => {
    if (m.status === 'completed') return acc + 1
    if (m.status === 'in_progress') return acc + 0.5
    return acc
  }, 0)

  const percentage =
    totalCount > 0 ? Math.round((weightedProgress / totalCount) * 100) : 0

  return {
    totalCount,
    completedCount,
    percentage,
  }
}
