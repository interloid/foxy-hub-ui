'use client'

import { FxProgress } from '@/components/shared/fx-progress'
import { useEffect, useState } from 'react'
import type { MilestoneItem } from '../types'

interface ProgressCardProps {
  milestones: MilestoneItem[]
}

export function ProgressCard({ milestones }: ProgressCardProps) {
  const totalCount = milestones.length

  // Count completed milestones
  const completedCount = milestones.filter(
    (m) => m.status === 'completed'
  ).length

  // Calculate percentage: completed = 100%, in_progress = 50% contribution
  const weightedProgress = milestones.reduce((acc, m) => {
    if (m.status === 'completed') return acc + 1
    if (m.status === 'in_progress') return acc + 0.5
    return acc
  }, 0)

  const percentage =
    totalCount > 0 ? Math.round((weightedProgress / totalCount) * 100) : 0

  // Calculate starting point near target (e.g., 40% of target value) so it doesn't animate from 0
  const initialOffset = Math.max(10, Math.floor(percentage * 0.4))
  const [animatedValue, setAnimatedValue] = useState(initialOffset)

  useEffect(() => {
    // Trigger paint cycle so the browser renders initial offset before animating to target
    const frameId = requestAnimationFrame(() => {
      setAnimatedValue(percentage)
    })

    return () => cancelAnimationFrame(frameId)
  }, [percentage])

  return (
    <div className="bg-card border-border rounded-xl border p-5 shadow-xs">
      <h3 className="text-foreground text-[14px] font-semibold">Progress</h3>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-foreground text-[28px] font-semibold tracking-tight">
          {percentage}%
        </span>
        <span className="text-subtle-foreground text-sm font-normal">
          {completedCount} of {totalCount} milestones
        </span>
      </div>

      {/* Progress Bar Container with custom duration override */}
      <FxProgress
        value={animatedValue}
        variant="default"
        size="lg"
        className="mt-3.5 [&>div]:duration-700 [&>div]:ease-out"
      />
    </div>
  )
}
