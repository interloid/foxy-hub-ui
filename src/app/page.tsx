import { getAccount, getWorkspace } from '@/lib/dal'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const account = await getAccount()

  if (!account) {
    redirect('/sign-in')
  }

  const workspace = await getWorkspace()
  const defaultOrg = workspace?.slug ?? 'default-org'

  redirect(`/${defaultOrg}`)
}
