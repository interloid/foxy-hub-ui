'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useRealtimeUpdates } from '../hooks/use-realtime-updates'
import type { ProjectUpdate } from '../types'

interface LatestUpdatesCardProps {
  updates: ProjectUpdate[]
  projectId: string
  isPostingUpdate?: boolean
}

export function LatestUpdatesCard({
  updates: initialUpdates,
  projectId,
}: LatestUpdatesCardProps) {
  // Hook handles realtime updates and limits display to top 5
  const updates = useRealtimeUpdates(initialUpdates, projectId, 5)

  return (
    <section
      aria-labelledby="latest-updates-heading"
      className="border-border bg-card flex flex-col overflow-hidden rounded-xl border shadow-xs"
    >
      <header className="border-border shrink-0 border-b px-5 py-4">
        <h2
          id="latest-updates-heading"
          className="text-foreground text-[14px] font-bold"
        >
          Latest updates
        </h2>
      </header>

      {updates.length === 0 ? (
        <div className="text-muted-foreground p-6 text-center text-xs">
          No updates posted yet.
        </div>
      ) : (
        <div className="relative overflow-hidden">
          <ul className="divide-border divide-y">
            <AnimatePresence initial={false} mode="popLayout">
              {updates.map((update) => (
                <motion.li
                  key={update.id}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                  className="ds:p-5 bg-card flex gap-3.5 p-4"
                >
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
                      <span className="text-foreground text-[13px] font-bold">
                        {update.authorName}
                      </span>
                      <time
                        dateTime={update.createdAt}
                        className="text-muted-foreground text-xs"
                      >
                        {formatRelativeTime(update.createdAt)}
                      </time>
                    </div>
                    <p className="text-muted-foreground text-[13px] leading-relaxed break-words">
                      {update.body}
                    </p>
                  </article>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
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
