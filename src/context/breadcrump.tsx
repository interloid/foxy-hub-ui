'use client'

import { createContext, ReactNode, useContext, useState } from 'react'

interface BreadcrumbContextType {
  projectName?: string
  setProjectName: (name: string) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(
  undefined
)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [projectName, setProjectName] = useState<string | undefined>(undefined)

  return (
    <BreadcrumbContext.Provider value={{ projectName, setProjectName }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb() {
  const context = useContext(BreadcrumbContext)
  if (!context) {
    throw new Error('useBreadcrumb must be used within a BreadcrumbProvider')
  }
  return context
}
