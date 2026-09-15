'use client'

import { env } from '@/config/env'
import {
  applyTheme,
  getSystemTheme,
  isTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  systemTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const SYSTEM_QUERY = '(prefers-color-scheme: dark)'

const THEME_CHANGE_EVENT = 'themechange'

function subscribeStoredTheme(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
  }
}

function subscribeSystemTheme(onStoreChange: () => void) {
  const mql = window.matchMedia(SYSTEM_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function readStoredTheme(fallback: Theme): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : fallback
  } catch {
    return fallback
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode
  defaultTheme?: Theme
}) {
  const theme = useSyncExternalStore(
    subscribeStoredTheme,
    () => readStoredTheme(defaultTheme),
    () => defaultTheme
  )

  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    (): ResolvedTheme => 'light'
  )

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  const hydratedRef = useRef(false)

  useEffect(() => {
    // The hydration commit still holds the server snapshots, where `systemTheme`
    // is always 'light'. Applying that would undo the theme the init script
    // already painted, so re-read the live sources for this first pass.
    if (!hydratedRef.current) {
      hydratedRef.current = true
      applyTheme(resolveTheme(readStoredTheme(defaultTheme)))
      return
    }

    applyTheme(resolvedTheme, true)
  }, [resolvedTheme, defaultTheme])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch (err) {
      if (env.NODE_ENV === 'development' && err instanceof Error) {
        toast.warning(`Failed to persist theme choice to localStorage: ${err}`)
      }
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, systemTheme, setTheme }),
    [theme, resolvedTheme, systemTheme, setTheme]
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (context === null) {
    throw new Error('useTheme must be used within a <ThemeProvider>.')
  }
  return context
}
