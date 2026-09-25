'use client'

import { useEffect, useRef } from 'react'

import { THEME_CHANGE_EVENT, useTheme } from '@/context/theme-provider'
import { updateTheme } from '@/features/settings/actions'
import { isTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme'

function readLocalTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Keeps Appearance in step between this browser and the account (`user_preferences.theme`).
 *
 * localStorage stays the FAST copy — the init script paints from it before React loads, so
 * there is no flash. The account row is what carries the choice to other devices:
 *
 *   - On load: the account has a theme → apply it here if this browser differs; the
 *     account has none yet → upload this browser's choice (people already had one in
 *     localStorage before the column existed, and must not be reset to a default).
 *   - After that: every change made in this tab (Settings switch, top-bar menu) is saved.
 *
 * Signed-out pages have no account, so this only lives in the signed-in layouts.
 */
export function ThemeSync({ accountTheme }: { accountTheme: Theme | null }) {
  const { setTheme } = useTheme()
  const lastSaved = useRef<Theme | null>(accountTheme)

  useEffect(() => {
    const local = readLocalTheme() ?? 'system'

    if (accountTheme === null) {
      lastSaved.current = local
      void updateTheme(local)
    } else if (local !== accountTheme) {
      // Set BEFORE applying, so the change event below sees nothing new to save.
      lastSaved.current = accountTheme
      setTheme(accountTheme)
    }
  }, [accountTheme, setTheme])

  useEffect(() => {
    const onChange = () => {
      const next = readLocalTheme()
      if (!next || next === lastSaved.current) return
      lastSaved.current = next
      void updateTheme(next)
    }
    window.addEventListener(THEME_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange)
  }, [])

  return null
}
