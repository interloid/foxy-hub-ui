'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { FxProgress } from '@/components/shared/fx-progress'
import { StudioPlanInfo } from '../../types'

interface StudioPlanCardProps {
  planInfo: StudioPlanInfo
  isAdmin: boolean
  onManageClick?: () => void
}

export function StudioPlanCard({
  planInfo,
  isAdmin,
  onManageClick,
}: StudioPlanCardProps) {
  const usedSeats = planInfo.usedSeats ?? 0
  const totalSeats = planInfo.totalSeats || 1
  const pct = Math.min(Math.round((usedSeats / totalSeats) * 100), 100)

  return (
    <FxCard className="overflow-hidden">
      <FxCardContent className="space-y-3.5 p-4 sm:p-5">
        {/* Header: Plan Name & Active Badge */}
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-[14px] font-semibold">
            {`${planInfo.name} plan`}
          </h3>
          <span className="bg-success/15 text-success inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize">
            {planInfo.status}
          </span>
        </div>

        {/* Plan Details Subtext */}
        <p className="text-muted-foreground text-[13px] font-normal">
          {usedSeats} of {totalSeats} seats used
          {planInfo.renewsAt
            ? ` · renews ${new Date(planInfo.renewsAt).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: '2-digit',
                }
              )}`
            : ''}
        </p>

        {/* Progress Bar */}
        <div className="w-full">
          <FxProgress value={pct} size="default" className="h-1.5 w-full" />
        </div>

        {/* Action Button / Admin Notice */}
        <div className="pt-0.5">
          {isAdmin ? (
            <FxButton
              variant="outline"
              size="default"
              onClick={onManageClick}
              className="text-foreground border-border hover:bg-accent/50 w-full text-[13px] font-medium"
            >
              Manage subscription
            </FxButton>
          ) : (
            <p className="text-muted-foreground text-center text-[12px]">
              Contact an Admin to manage billing
            </p>
          )}
        </div>
      </FxCardContent>
    </FxCard>
  )
}
