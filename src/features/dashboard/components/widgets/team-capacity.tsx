'use client'

import { FxAvatar, FxAvatarFallback } from '@/components/shared/fx-avatar'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { FxProgress } from '@/components/shared/fx-progress'
import { CapacityRow } from '../../types'

interface TeamCapacityProps {
  capacities?: CapacityRow[]
  overCount?: number
  onViewAllClick?: () => void
}

const AVATAR_PALETTES = [
  { bg: 'rgba(26, 115, 232, 1)', color: '#66a5ff' }, // Blue
  { bg: 'rgba(161, 66, 244, 1)', color: '#c084fc' }, // Purple
  { bg: 'rgba(230, 120, 23, 1)', color: '#fbbf24' }, // Amber
  { bg: 'rgba(19, 115, 51, 1)', color: '#4ade80' }, // Green
  { bg: 'rgba(217, 48, 37, 1)', color: '#f87171' }, // Red
  { bg: 'rgba(18, 166, 186, 1)', color: '#22d3ee' }, // Cyan
]

export function getAvatarPalette(index: number) {
  return AVATAR_PALETTES[index % AVATAR_PALETTES.length]
}

export function TeamCapacity({
  capacities = [],
  onViewAllClick,
}: TeamCapacityProps) {
  if (!capacities || capacities.length === 0) {
    return null
  }
  if (capacities.length === 0) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center rounded-lg border border-dashed p-4 text-sm">
        No team capacity data available.
      </div>
    )
  }

  return (
    <FxCard className="overflow-hidden">
      <FxCardContent className="p-0">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-foreground text-[14px] font-semibold">
            Team capacity
          </h3>
          <FxButton
            variant="ghost"
            size="xs"
            onClick={onViewAllClick}
            className="text-muted-foreground hover:text-foreground h-auto bg-transparent p-0 text-[12.5px] hover:bg-transparent"
          >
            View all
          </FxButton>
        </div>

        {/* List Items */}
        <div className="space-y-4 p-4 sm:p-5">
          {capacities.map((item, index) => {
            const rawPct =
              (item.pctValue ?? parseInt(item.pctLabel.replace('%', ''), 10)) ||
              0
            const isFull = rawPct >= 100
            const pctColorClass = isFull ? 'text-success' : 'text-primary'

            // Get unique theme-friendly color palette for this avatar
            const palette = getAvatarPalette(index)

            return (
              <div key={item.id} className="space-y-2">
                {/* Top Row: Avatar, Name & Percentage */}
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FxAvatar className="size-6.5 shrink-0">
                      <FxAvatarFallback
                        style={{
                          backgroundColor: palette.bg,
                        }}
                        className="text-[9px] font-semibold text-white"
                      >
                        {item.initials}
                      </FxAvatarFallback>
                    </FxAvatar>
                    <span className="text-foreground truncate text-[12.5px] font-medium">
                      {item.name}
                    </span>
                  </div>

                  <span
                    className={`font-mono text-[12px] font-bold ${pctColorClass}`}
                  >
                    {item.pctLabel}
                  </span>
                </div>

                {/* Progress Bar Span */}
                <div className="w-full">
                  <FxProgress
                    value={rawPct}
                    size="default"
                    variant={isFull ? 'success' : 'default'}
                    className="h-1.5 w-full"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </FxCardContent>
    </FxCard>
  )
}
