// The Log time timer's state, kept in sessionStorage: it survives a reload or leaving the page
// and coming back in the same tab, but closing the tab or the browser clears it, so a
// forgotten timer never keeps counting. Falls back to memory when storage is unavailable.
// sessionStorage is per tab, so a timer started in one tab is not seen in another.

export interface TimerState {
  /** When the current run started (ms since epoch); null while paused or stopped. */
  startedAt: number | null
  /** Time from earlier runs, before the last pause. */
  accumulatedMs: number
}

const EMPTY: TimerState = { startedAt: null, accumulatedMs: 0 }
const EVENT = 'foxy:log-timer'

const memory = new Map<string, string>()

function storageKey(scope: string) {
  return `foxy:log-timer:${scope}`
}

function readRaw(scope: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(scope))
  } catch {
    return memory.get(scope) ?? null
  }
}

export function readTimer(raw: string | null): TimerState {
  if (!raw) return EMPTY
  try {
    const parsed = JSON.parse(raw) as Partial<TimerState>
    return {
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : null,
      accumulatedMs:
        typeof parsed.accumulatedMs === 'number' ? parsed.accumulatedMs : 0,
    }
  } catch {
    return EMPTY
  }
}

export function writeTimer(scope: string, state: TimerState) {
  const raw = JSON.stringify(state)
  try {
    window.sessionStorage.setItem(storageKey(scope), raw)
  } catch {
    memory.set(scope, raw)
  }
  window.dispatchEvent(new Event(EVENT))
}

/** For `useSyncExternalStore`: re-read whenever this tab writes the timer. */
export function subscribeTimer(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
}

/** The raw string is the snapshot: a string compares by value, so it is stable. */
export function getTimerSnapshot(scope: string) {
  return readRaw(scope)
}

export function elapsedMs(state: TimerState, now: number): number {
  return state.accumulatedMs + (state.startedAt ? now - state.startedAt : 0)
}

// Actions read the clock here, outside any component, so rendering stays pure.
export function startTimer(scope: string, state: TimerState) {
  writeTimer(scope, { ...state, startedAt: Date.now() })
}

export function pauseTimer(scope: string, state: TimerState) {
  writeTimer(scope, {
    startedAt: null,
    accumulatedMs: elapsedMs(state, Date.now()),
  })
}

export function resetTimer(scope: string) {
  writeTimer(scope, { startedAt: null, accumulatedMs: 0 })
}

export function currentTime() {
  return Date.now()
}
