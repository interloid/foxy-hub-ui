'use client'

import { useState } from 'react'

import { CapacityRow } from '../../types'
import { TeamRatesSheet } from '../sheets/team-rates-sheet'
import { TeamCapacity } from './team-capacity'

interface TeamCapacityCardProps {
  capacities?: CapacityRow[]
  overCount?: number
}

/**
 * Gives the widget's "View all" a destination.
 *
 * `TeamCapacity` is presentational and renders on the server; it has always accepted an
 * `onViewAllClick` that nothing passed, so the button sat there inert. Holding the sheet
 * state out here keeps the widget itself unchanged — and un-clienting it — while making
 * the control it already draws actually do something.
 *
 * Only rendered for owners and admins. A teammate who cannot set rates still gets the plain
 * widget, exactly as before.
 */
export function TeamCapacityCard({
  capacities = [],
  overCount,
}: TeamCapacityCardProps) {
  const [isRatesSheetOpen, setIsRatesSheetOpen] = useState(false)

  return (
    <>
      <TeamCapacity
        capacities={capacities}
        overCount={overCount}
        onViewAllClick={() => setIsRatesSheetOpen(true)}
      />
      <TeamRatesSheet
        open={isRatesSheetOpen}
        onOpenChange={setIsRatesSheetOpen}
      />
    </>
  )
}
