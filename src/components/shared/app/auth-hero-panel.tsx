import Image from 'next/image'

import { NAV_ICONS, type NavIconName } from '@/components/layout/nav-icons'
import { cn } from '@/lib/utils'

export type AuthHeroPoint = { icon: NavIconName; label: string }

function AuthHeroPanel({
  image,
  eyebrow,
  headline,
  points,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  image: { src: string; width: number; height: number }
  eyebrow: string
  headline: string
  points: readonly AuthHeroPoint[]
}) {
  return (
    <div
      data-slot="auth-hero-panel"
      className={cn('relative flex overflow-hidden', className)}
      {...props}
    >
      <Image
        src={image.src}
        width={image.width}
        height={image.height}
        alt=""

        priority
        sizes="(min-width: 761px) 50vw, 0px"

        className="absolute inset-0 size-full object-cover object-bottom"
      />
      <div className="bg-auth-wash pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center px-[7%] py-12 text-white">
        <div className="max-w-110">
          <div className="mb-4 text-base font-semibold tracking-[.03em] uppercase opacity-85">
            {eyebrow}
          </div>
          <div className="mb-7 text-4xl font-semibold text-pretty">
            {headline}
          </div>
          <div className="flex flex-col gap-3.5">
            {points.map((point) => {
              const Icon = NAV_ICONS[point.icon]
              return (
                <div key={point.label} className="flex items-center gap-3">
                  <span className="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-white/18">
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="text-lg">{point.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export { AuthHeroPanel }
