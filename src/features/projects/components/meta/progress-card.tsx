'use client'

import { FxProgress } from '@/components/shared/fx-progress'
import { calculateMilestoneProgress } from '@/lib/progress'
import { useEffect, useState } from 'react'
import type { MilestoneItem } from '../../types'

interface ProgressCardProps {
  milestones: MilestoneItem[]
}

export function ProgressCard({ milestones }: ProgressCardProps) {
  const { completedCount, percentage, totalCount } =
    calculateMilestoneProgress(milestones)

  const initialOffset = Math.max(10, Math.floor(percentage * 0.4))
  const [animatedValue, setAnimatedValue] = useState(initialOffset)

  useEffect(() => {
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
