import { toast } from 'sonner'

export const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed'

export const SIDEBAR_CHANGE_EVENT = 'sidebarchange'

export function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0')
  } catch (err) {
    if (process.env.NODE_ENV === 'development' && err instanceof Error) {
      toast.warning(
        `Failed to persist sidebar state to localStorage, ${err?.message}`
      )
    }
  }
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT))
}

export function subscribeCollapsed(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange)
  }
}
