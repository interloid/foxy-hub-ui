'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { NewProjectFormData } from './types'

interface NewProjectDataContextValue extends NewProjectFormData {
  /** Hours/day a teammate is already booked for on a date, keyed by `capacityKey`. */
  existingHours: Record<string, number>
}

const NewProjectDataContext = createContext<NewProjectDataContextValue | null>(
  null
)

export function NewProjectDataProvider({
  value,
  children,
}: {
  value: NewProjectDataContextValue
  children: ReactNode
}) {
  return (
    <NewProjectDataContext.Provider value={value}>
      {children}
    </NewProjectDataContext.Provider>
  )
}

export function useNewProjectData() {
  const context = useContext(NewProjectDataContext)
  if (!context) {
    throw new Error(
      'useNewProjectData must be used inside NewProjectDataProvider'
    )
  }
  return context
}
