import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

/** A field: label above a control. `h-10` matches the wizard's inputs and selects. */
function FieldSkeleton({ labelWidth = 'w-24' }: { labelWidth?: string }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className={`h-3.5 ${labelWidth}`} />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  )
}

// Loading state for /[org]/projects/new - the same layout as NewProjectWizard: breadcrumb
// header, the four-step stepper, the Basics card and the footer, so nothing jumps when the
// form arrives.
export function NewProjectSkeleton() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6"
      aria-busy="true"
      aria-label="Loading new project form"
    >
      {/* Header: "← All projects / New project · Nothing is created until the last step" */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
        {/* Stepper: Basics, Scope & milestones, How it bills, Team & capacity */}
        <ol className="flex flex-col gap-2.5">
          {['w-16', 'w-32', 'w-24', 'w-28'].map((titleWidth, index) => (
            <li
              key={titleWidth}
              className="bg-card border-border flex items-start gap-3 rounded-xl border p-3.5"
            >
              <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className={`h-3.5 ${titleWidth}`} />
                <Skeleton className={`h-3 ${index === 1 ? 'w-36' : 'w-28'}`} />
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-4">
          {/* Basics: project name, then client / owner, then the two dates */}
          <FxCard className="rounded-xl">
            <FxCardContent className="flex flex-col gap-5 p-5">
              <FieldSkeleton labelWidth="w-28" />
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2">
                <FieldSkeleton labelWidth="w-14" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <FieldSkeleton labelWidth="w-24" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
              </div>
            </FxCardContent>
          </FxCard>

          {/* Footer: hint on the left, Cancel + Next on the right */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-3.5 w-52" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
