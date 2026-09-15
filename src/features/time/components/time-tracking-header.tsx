import { FxButton } from '@/components/shared/fx-button'
import { Plus } from 'lucide-react'
import { TimeTrackingHeaderProps } from '../types'

export function TimeTrackingHeader({
  userName = 'Priya Nair',
  onLogTime,
}: TimeTrackingHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-foreground text-2xl font-bold tracking-tight">
          Time tracking
        </h2>
        <p className="text-muted-foreground text-sm">
          Log hours against a project and milestone — {userName}, this week.
        </p>
      </div>

      <FxButton
        onClick={onLogTime}
        variant="default"
        className="w-fit gap-2 font-medium"
      >
        <Plus className="h-4 w-4" />
        Log time
      </FxButton>
    </div>
  )
}
