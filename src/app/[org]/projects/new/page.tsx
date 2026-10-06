import { NewProjectWizard } from '@/features/projects/components/new-project/new-project-wizard'
import { getNewProjectFormData } from '@/features/projects/queries/get-new-project-data'
import { getWorkspace, isAdminRole } from '@/lib/dal'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

interface NewProjectPageProps {
  params: Promise<{
    org: string
  }>
}

export const metadata: Metadata = {
  title: 'New project | Foxy Hub',
}

export default async function NewProjectPage({ params }: NewProjectPageProps) {
  const { org } = await params

  const workspace = await getWorkspace(org)
  if (!workspace) notFound()

  // Only admins can create projects - everyone else goes back to the list.
  if (!isAdminRole(workspace.role)) redirect(`/${org}/projects`)

  const data = await getNewProjectFormData(workspace)
  if (!data) redirect('/sign-in')

  return <NewProjectWizard orgSlug={org} data={data} />
}
