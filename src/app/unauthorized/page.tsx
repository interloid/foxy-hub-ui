import Link from 'next/link'

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>
}) {
  const { org } = await searchParams

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-3xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground mt-2">
        You do not have permission to access{' '}
        {org ? `"${org}"` : 'this organization'}.
      </p>
      <div className="mt-6 flex gap-4">
        <Link href="/" className="bg-primary text-card rounded-md px-4 py-2">
          Go to my organization
        </Link>
      </div>
    </main>
  )
}
