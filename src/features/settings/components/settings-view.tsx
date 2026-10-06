'use client'

import { useState } from 'react'

import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import type { AccountDTO } from '@/lib/dal'

import type { DeviceSession, WorkspaceSettings } from '../types'
import { GeneralTab } from './general-tab'
import { SecurityTab } from './security-tab'
import { WorkspaceTab } from './workspace-tab'

/** Each tab carries the page heading shown while it is open. */
const TABS = [
  {
    value: 'general',
    label: 'General',
    title: 'Your account',
    description: 'Your details and how Foxy HUB behaves for you.',
  },
  {
    value: 'security',
    label: 'Security',
    title: 'Security',
    description: 'How you sign in, and where you are signed in right now.',
  },
  {
    value: 'workspace',
    label: 'Workspace',
    title: 'Workspace',
    description:
      'Shared rules every project, timesheet and invoice is measured against.',
  },
] as const

type TabValue = (typeof TABS)[number]['value']

const isTab = (value: string): value is TabValue =>
  TABS.some((tab) => tab.value === value)

export function SettingsView({
  settings,
  account,
  devices,
  orgSlug,
}: {
  settings: WorkspaceSettings
  account: AccountDTO
  devices: DeviceSession[]
  orgSlug: string
}) {
  const [tab, setTab] = useState<TabValue>('general')
  const active = TABS.find((t) => t.value === tab) ?? TABS[0]

  return (
    <div className="flex w-full flex-col gap-5 md:p-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-[24px] font-medium tracking-tight">
          {active.title}
        </h1>
        <p className="text-muted-foreground text-[14px]">
          {active.description}
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => isTab(value) && setTab(value)}
        className="w-full gap-8"
      >
        <div className="w-full scrollbar-none overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <FxTabsListUnderline
            aria-label="Settings sections"
            className="w-full min-w-max"
          >
            {TABS.map((tab) => (
              <FxTabsTriggerUnderline
                key={tab.value}
                value={tab.value}
                className="cursor-pointer text-[14px]"
              >
                {tab.label}
              </FxTabsTriggerUnderline>
            ))}
          </FxTabsListUnderline>
        </div>

        <TabsContent value="general">
          <GeneralTab account={account} orgSlug={orgSlug} />
        </TabsContent>

        <TabsContent value="security">
          <SecurityTab
            orgSlug={orgSlug}
            inactivityTimeout={account.inactivityTimeout}
            devices={devices}
            mfaEnabled={Boolean(account.mfaEnabledAt)}
            passwordChangedAt={account.passwordChangedAt}
          />
        </TabsContent>

        <TabsContent value="workspace">
          <WorkspaceTab
            settings={settings}
            orgSlug={orgSlug}
            account={account}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
