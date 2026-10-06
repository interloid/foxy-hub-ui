'use client'

import { AppShell } from '@/components/layout/app-shell'
import { useBreadcrumb } from '@/context/breadcrump'
import { ComponentProps } from 'react'

type AppShellProps = ComponentProps<typeof AppShell>

export function AppShellWrapper(props: Omit<AppShellProps, 'projectName'>) {
  const { projectName } = useBreadcrumb()

  return <AppShell {...props} projectName={projectName} />
}
