'use client'

import { useBreadcrumb } from '@/context/breadcrump'
import { useEffect } from 'react'

export function ProjectBreadcrumbSetter({ name }: { name?: string }) {
  const { setProjectName } = useBreadcrumb()

  useEffect(() => {
    if (name) {
      setProjectName(name)
    }
  }, [name, setProjectName])

  return null
}
