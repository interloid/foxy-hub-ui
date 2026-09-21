import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

/** Label over a control, the shape every field in the form grid takes. */
function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  )
}

/**
 * Mirrors `SettingsView`: the workspace card, the four-up working day & billing grid, and
 * the members & clients link card. No outer padding, because the view itself has none —
 * the shell supplies it.
 *
 * The Edit and Save buttons are drawn unconditionally. They are `canEdit`-gated in the real
 * view, but that is not known until the data lands, and a placeholder that disappears reads
 * better than one that appears.
 */
export function SettingsSkeleton() {
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <FxCard>
        <FxCardContent className="space-y-4 p-5">
          <Skeleton className="h-4 w-24" />

          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-11 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
            </div>
            <Skeleton className="h-7 w-14 shrink-0 rounded-md" />
          </div>
        </FxCardContent>
      </FxCard>

      <FxCard>
        <FxCardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-full max-w-160" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-3 w-96 max-w-full" />
            <Skeleton className="h-7 w-28 rounded-md" />
          </div>
        </FxCardContent>
      </FxCard>

      <FxCard>
        <FxCardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-full max-w-140" />
          </div>
          <Skeleton className="h-9 w-52 shrink-0 rounded-md" />
        </FxCardContent>
      </FxCard>
    </div>
  )
}
