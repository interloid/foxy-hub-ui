/** Shown across the top of every page in the shared demo workspace. */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="bg-info-subtle text-info shrink-0 px-4 py-1.5 text-center text-[12.5px] leading-snug font-medium"
    >
      Demo workspace - shared with other visitors and reset every hour. Some
      actions are turned off.
    </div>
  )
}
