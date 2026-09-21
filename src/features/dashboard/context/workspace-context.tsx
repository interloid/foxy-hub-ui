'use client'

import { createContext, ReactNode, useContext } from 'react'

interface WorkspaceContextType {
  orgSlug: string
  orgId?: string
  currency?: string
  userRole?: string | null
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined
)

export function WorkspaceProvider({
  orgSlug,
  orgId,
  currency,
  userRole,
  children,
}: WorkspaceContextType & { children: ReactNode }) {
  return (
    <WorkspaceContext.Provider value={{ orgSlug, orgId, userRole, currency }}>
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
