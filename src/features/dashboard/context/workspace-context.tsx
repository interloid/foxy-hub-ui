'use client'

import { createContext, ReactNode, useContext } from 'react'

interface WorkspaceContextType {
  orgSlug: string
  orgId?: string
  currency?: string
  userRole?: string | null
  /** The shared demo workspace - some actions are turned off (see DemoDisabled). */
  isDemo?: boolean
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined
)

export function WorkspaceProvider({
  orgSlug,
  orgId,
  currency,
  userRole,
  isDemo = false,
  children,
}: WorkspaceContextType & { children: ReactNode }) {
  return (
    <WorkspaceContext.Provider
      value={{ orgSlug, orgId, userRole, currency, isDemo }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}

/** True inside the shared demo workspace; false outside any workspace. */
export function useIsDemo() {
  return useContext(WorkspaceContext)?.isDemo ?? false
}
