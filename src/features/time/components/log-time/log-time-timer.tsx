'use client'

import { FxButton } from '@/components/shared/fx-button'
import { formatMinutesToLabel } from '@/lib/time'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  currentTime,
  elapsedMs,
  getTimerSnapshot,
  pauseTimer,
  readTimer,
  resetTimer,
  startTimer,
  subscribeTimer,
} from './timer-store'

interface LogTimeTimerProps {
  /** Separates timers between workspaces. */
  scope: string
  /** Fills the Duration field with the timed minutes. */
  onUse: (minutes: number) => void
}

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function LogTimeTimer({ scope, onUse }: LogTimeTimerProps) {
  const raw = useSyncExternalStore(
    subscribeTimer,
    () => getTimerSnapshot(scope),
    // On the server there is no storage, so the timer renders stopped and then picks up
    // any running timer once hydrated.
    () => null
  )
  const timer = readTimer(raw)
  const isRunning = timer.startedAt !== null

  const [now, setNow] = useState(currentTime)
  useEffect(() => {
    if (!isRunning) return
    const id = window.setInterval(() => setNow(currentTime()), 1000)
    return () => window.clearInterval(id)
  }, [isRunning])

  const elapsed = elapsedMs(
    timer,
    isRunning ? Math.max(now, timer.startedAt!) : now
  )
  const elapsedMinutes = Math.max(1, Math.round(elapsed / 60_000))
  const hasTime = elapsed >= 1000

  const start = () => {
    setNow(currentTime())
    startTimer(scope, timer)
  }
  const pause = () => pauseTimer(scope, timer)
  const reset = () => resetTimer(scope)
  const use = () => {
    onUse(elapsedMinutes)
    reset()
  }

  return (
    <div className="border-border bg-muted/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div>
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          Timer
        </p>
        <p
          className="text-foreground font-mono text-[26px] font-bold tabular-nums"
          aria-live="off"
        >
          {formatClock(elapsed)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isRunning ? (
          <FxButton
            type="button"
            variant="secondary"
            onClick={pause}
            className="gap-1.5"
          >
            <Pause className="size-3.5" />
            Pause
          </FxButton>
        ) : (
          <FxButton
            type="button"
            variant="secondary"
            onClick={start}
            className="gap-1.5"
          >
            <Play className="size-3.5 fill-current" />
            {hasTime ? 'Resume' : 'Start timer'}
          </FxButton>
        )}

        {!isRunning && hasTime && (
          <>
            <FxButton type="button" onClick={use}>
              Use {formatMinutesToLabel(elapsedMinutes)}
            </FxButton>
            <FxButton
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Reset timer"
              onClick={reset}
            >
              <RotateCcw className="size-4" />
            </FxButton>
          </>
        )}
      </div>
    </div>
  )
}
