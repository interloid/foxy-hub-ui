import type { ProjectUpdate } from '../types'

interface LatestUpdatesCardProps {
  updates: ProjectUpdate[]
}

export function LatestUpdatesCard({ updates }: LatestUpdatesCardProps) {
  console.log(updates)
  return (
    <section
      aria-labelledby="latest-updates-heading"
      className="border-border bg-card rounded-xl border shadow-xs"
    >
      <header className="border-border border-b px-5 py-4">
        <h2
          id="latest-updates-heading"
          className="text-foreground text-base font-bold"
        >
          Latest updates
        </h2>
      </header>

      {updates.length === 0 ? (
        <div className="text-muted-foreground p-6 text-center text-xs">
          No updates posted yet.
        </div>
      ) : (
        <ul className="divide-border divide-y">
          {updates.map((update) => (
            <li key={update.id} className="ds:p-5 flex gap-3.5 p-4">
              {/* User Avatar Badge */}
              <div
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                  update.avatarColorClass ||
                  'bg-primary text-primary-foreground'
                }`}
              >
                {update.authorInitials}
              </div>

              {/* Update Body and Meta */}
              <article className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-foreground text-sm font-bold">
                    {update.authorName}
                  </span>
                  <time
                    dateTime={update.createdAt}
                    className="text-muted-foreground text-xs"
                  >
                    {formatRelativeTime(update.createdAt)}
                  </time>
                </div>
                <p className="text-muted-foreground ds:text-sm text-xs leading-relaxed">
                  {update.body}
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 3600) {
    const mins = Math.max(1, Math.floor(diffInSeconds / 60))
    return `${mins}m ago`
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}h ago`
  }
  if (diffInSeconds < 172800) {
    return 'Yesterday'
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
