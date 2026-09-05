import type { ClientItem } from '../types'

interface ClientCardProps {
  client?: ClientItem | null
}

function getInitials(name: string): string {
  if (!name) return ''
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function ClientCard({ client }: ClientCardProps) {
  if (!client) {
    return (
      <section
        aria-labelledby="client-card-heading"
        className="bg-card border-border rounded-xl border p-5 shadow-xs"
      >
        <h3
          id="client-card-heading"
          className="text-foreground text-[14px] font-semibold"
        >
          Client
        </h3>
        <p className="text-muted-foreground mt-3 text-xs italic">
          Internal project (no client assigned)
        </p>
      </section>
    )
  }

  const initials = getInitials(client.name)

  return (
    <section
      aria-labelledby="client-card-heading"
      className="bg-card border-border rounded-xl border p-5 shadow-xs"
    >
      {/* Header */}
      <h3
        id="client-card-heading"
        className="text-foreground text-[14px] font-semibold"
      >
        Client
      </h3>

      {/* Content */}
      <div className="mt-3.5 flex items-center gap-3">
        {/* Avatar Circle */}
        <div className="bg-info text-brand-white flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold shadow-xs">
          {initials}
        </div>

        {/* Client & Contact Info */}
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-[14px] leading-tight font-semibold">
            {client.name}
          </p>
          {client.contactName && (
            <p className="text-subtle-foreground truncate text-[12.5px] leading-normal font-normal">
              {client.contactName}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
