import { cn } from '@/lib/utils'

export function AuthLayout({
  children,
  brand,
  tagline,
  hero,
  className,
}: {
  children: React.ReactNode
  brand: { name: string; mark: string }
  /** The stacked layout's card copy. Never rendered at ≥761px. */
  tagline: string
  hero: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="auth-layout"
      className={cn('auth:grid-cols-2 grid min-h-svh grid-cols-1', className)}
    >
      <div className="auth:px-[8%] auth:py-12 mx-auto flex w-full max-w-140 flex-col justify-center px-5.5 pt-7 pb-10">
        {/* Stacked brand card — the hero column's stand-in below 761px. */}
        <div
          data-slot="auth-brand-card"
          className="bg-auth-card auth:hidden mb-7 flex flex-col gap-3.5 rounded-3xl p-5.5 text-white"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-7.5 shrink-0 items-center justify-center rounded-md bg-white/20 text-[15px] font-bold">
              {brand.mark}
            </span>
            <span className="text-[16px] font-semibold">{brand.name}</span>
          </div>
          {/* 18px/1.35 — 18 is not a rung of the ten-step scale (14.5 then 17 then 19), so it
              stays an arbitrary value here rather than being rounded onto `text-2xl`. */}
          <div className="text-[18px] leading-snug font-semibold text-pretty">
            {tagline}
          </div>
        </div>

        {/* Split brand row — the card's counterpart at ≥761px. */}
        <div className="auth:flex mb-11 hidden items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-xl font-bold">
            {brand.mark}
          </span>
          <span className="text-xl font-semibold">{brand.name}</span>
        </div>

        {children}
      </div>

      <div className="auth:flex hidden">{hero}</div>
    </div>
  )
}
