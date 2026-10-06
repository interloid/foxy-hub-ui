import { Check, X } from 'lucide-react'

import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { roleLabel, type UserRole } from '@/lib/role'

import { ROLE_ACCESS } from '../data'

export function RoleAccessCard({
  role,
  orgName,
}: {
  role: string | null
  orgName?: string
}) {
  const capabilities = role
    ? ROLE_ACCESS.capabilities[role.toLowerCase().trim() as UserRole]
    : undefined
  if (!capabilities) return null

  return (
    <FxCard>
      <FxCardContent className="space-y-4 p-5">
        <div className="space-y-1">
          <h2 className="text-foreground text-base font-semibold">
            {roleLabel(role)} access
          </h2>
          <p className="text-subtle-foreground text-sm">
            {ROLE_ACCESS.description(orgName ?? ROLE_ACCESS.fallbackOrg)}
          </p>
        </div>

        <ul className="space-y-3">
          {capabilities.map((item) => (
            <li
              key={item.label}
              className="text-foreground flex items-start gap-3 text-sm"
            >
              {item.allowed ? (
                <Check
                  aria-label="Included"
                  className="text-success mt-0.5 size-4 shrink-0"
                />
              ) : (
                <X
                  aria-label="Not included"
                  className="text-subtle-foreground mt-0.5 size-4 shrink-0"
                />
              )}
              <span
                className={item.allowed ? undefined : 'text-muted-foreground'}
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </FxCardContent>
    </FxCard>
  )
}
