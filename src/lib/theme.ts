export const THEME_STORAGE_KEY = 'theme'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export type ResolvedTheme = 'light' | 'dark'

export const DARK_CLASS = 'dark'

const SYSTEM_QUERY = '(prefers-color-scheme: dark)'

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === 'string' && (THEMES as readonly string[]).includes(value)
  )
}

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light'
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

export function applyTheme(
  resolved: ResolvedTheme,
  disableTransitions = false
): void {
  const root = document.documentElement

  let restore: (() => void) | undefined
  if (disableTransitions) {
    const style = document.createElement('style')
    style.appendChild(
      document.createTextNode(
        '*,*::before,*::after{transition:none !important}'
      )
    )
    document.head.appendChild(style)
    restore = () => {
      document.body.getBoundingClientRect()
      document.head.removeChild(style)
    }
  }

  root.classList.toggle(DARK_CLASS, resolved === 'dark')
  root.style.colorScheme = resolved

  restore?.()
}

export const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var m=window.matchMedia(${JSON.stringify(
  SYSTEM_QUERY
)}).matches;var dark=t==="dark"||((t===null||t==="system")&&m);d.classList.toggle(${JSON.stringify(
  DARK_CLASS
)},dark);d.style.colorScheme=dark?"dark":"light";}catch(e){}})();`
