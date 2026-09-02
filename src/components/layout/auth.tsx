import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

export function AuthLayout({
  children,
  brand,
  tagline,
  hero,
  className,
}: {
  children: ReactNode
  brand: { name: string; mark: string }
  tagline: string
  hero: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="auth-layout"
      className={cn('grid min-h-svh grid-cols-1 lg:grid-cols-2', className)}
    >
      <div className="auth:py-12 mx-auto flex w-full max-w-120 flex-col justify-center px-5.5 pt-7 pb-10 md:max-w-140 lg:px-[8%]">
        <div
          data-slot="auth-brand-card"
          className="bg-auth-card auth:hidden text-brand-white mb-7 flex flex-col gap-3.5 rounded-3xl p-5.5"
        >
          <div className="flex items-center gap-2.5">
            <span className="bg-brand-white/20 flex size-7.5 shrink-0 items-center justify-center rounded-md text-[15px] font-bold">
              {brand.mark}
            </span>
            <span className="text-[16px] font-semibold">{brand.name}</span>
          </div>
          <div className="text-[18px] leading-snug font-semibold text-pretty">
            {tagline}
          </div>
        </div>

        <div className="auth:flex mb-11 hidden items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-xl font-bold">
            {brand.mark}
          </span>
          <span className="text-xl font-semibold">{brand.name}</span>
        </div>

        {children}
      </div>

      <div className="hidden lg:flex">{hero}</div>
    </div>
  )
}
