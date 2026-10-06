import Image from 'next/image'

import { cn } from '@/lib/utils'

/** The profile photo when there is one, otherwise the brand-gradient initials disc. */
export function UserAvatar({
  initials,
  avatarUrl,
  className,
}: {
  initials: string
  avatarUrl?: string | null
  className?: string
}) {
  return (
    <span
      className={cn(
        'bg-brand-gradient text-primary-foreground relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        className
      )}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          fill
          sizes="128px"
          className="object-cover"
        />
      ) : (
        initials
      )}
    </span>
  )
}
