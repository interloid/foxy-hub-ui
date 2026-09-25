'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { useRealtimeUpdates } from '../../hooks/use-realtime-updates'
import type { ProjectUpdate } from '../../types'
import { useFormatter } from '@/context/locale-provider'
import type { Formatter } from '@/lib/format'

interface LatestUpdatesCardProps {
  updates: ProjectUpdate[]
  projectId: string
  isPostingUpdate?: boolean
  isOverview?: boolean
  isError?: boolean
}

export function LatestUpdatesCard({
  updates: initialUpdates,
  projectId,
  isOverview = false,
  isError = false,
}: LatestUpdatesCardProps) {
  const fmt = useFormatter()
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

      {isError ? (
        <div className="text-destructive flex items-center justify-center gap-2 p-6 text-center text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Failed to load latest updates. Please refresh to try again.
          </span>
        </div>
      ) : updates.length === 0 ? (
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
                        {formatRelativeTime(update.createdAt, fmt)}
                      </time>
                    </div>
                    <p
                      className={`text-muted-foreground text-[13px] leading-relaxed ${
                        isOverview
                          ? 'truncate'
                          : 'max-h-32 overflow-y-auto pr-1 wrap-break-word'
                      }`}
                    >
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

function formatRelativeTime(dateString: string, fmt: Formatter): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return 'Less than a minute'
  }
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60)
    return `${mins}m ago`
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}h ago`
  }
  if (diffInSeconds < 172800) {
    return 'Yesterday'
  }
  return fmt.date(date, 'day')
}
