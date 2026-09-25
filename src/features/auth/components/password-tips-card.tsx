import { Check } from 'lucide-react'

import { FxCard, FxCardContent } from '@/components/shared/fx-card'

import { CHANGE_PASSWORD } from '../data'

const TIPS = CHANGE_PASSWORD.tips

export function PasswordTipsCard() {
  return (
    <FxCard>
      <FxCardContent className="space-y-4 p-5">
        <h2 className="text-foreground text-base font-semibold">
          {TIPS.title}
        </h2>

        <ul className="space-y-3">
          {TIPS.items.map((item) => (
            <li
              key={item}
              className="text-foreground flex items-start gap-3 text-sm"
            >
              <Check
                aria-hidden="true"
                className="text-success mt-0.5 size-4 shrink-0"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="border-border text-subtle-foreground border-t pt-4 text-xs">
          {TIPS.note}
        </p>
      </FxCardContent>
    </FxCard>
  )
}
