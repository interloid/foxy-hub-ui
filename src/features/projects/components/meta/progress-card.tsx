'use client'

import { FxProgress } from '@/components/shared/fx-progress'
import { calculateMilestoneProgress } from '@/lib/progress'
import { AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MilestoneItem } from '../../types/milestone'

interface ProgressCardProps {
  milestones: MilestoneItem[]
  isError?: boolean
}

export function ProgressCard({
  milestones,
  isError = false,
}: ProgressCardProps) {
  const { completedCount, percentage, totalCount } =
    calculateMilestoneProgress(milestones)

  const initialOffset = Math.max(10, Math.floor(percentage * 0.4))
  const [animatedValue, setAnimatedValue] = useState(initialOffset)

  useEffect(() => {
    if (isError) return

    const frameId = requestAnimationFrame(() => {
      setAnimatedValue(percentage)
    })

    return () => cancelAnimationFrame(frameId)
  }, [percentage, isError])

  return (
    <div className="bg-card border-border rounded-xl border p-5 shadow-xs">
      <h3 className="text-foreground text-[14px] font-semibold">Progress</h3>

      {isError ? (
        <div className="text-destructive flex items-center gap-2 py-4 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load milestone progress.</span>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-foreground text-[28px] font-semibold tracking-tight">
              {percentage}%
            </span>
            <span className="text-subtle-foreground text-sm font-normal">
              {completedCount} of {totalCount} milestones
            </span>
          </div>

          <FxProgress
            value={animatedValue}
            variant="default"
            size="lg"
            className="mt-3.5 [&>div]:duration-700 [&>div]:ease-out"
          />
        </>
      )}
    </div>
  )
}
