import { ThemeSwitcher } from '@/components/common/theme-switcher'

export default function Home() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-between p-24">
      <div className="flex w-full max-w-5xl items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">foxy-hub</h1>
        <ThemeSwitcher />
      </div>

      <div className="flex flex-col items-center space-y-4 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Agency Client Portal MVP
        </h2>
        <p className="text-muted-foreground max-w-md">
          Multi-tenant client management, real-time approvals, and Stripe
          billing powered by Next.js and Supabase.
        </p>
      </div>

      <div className="text-muted-foreground text-xs">
        Ready for implementation.
      </div>
    </main>
  )
}
