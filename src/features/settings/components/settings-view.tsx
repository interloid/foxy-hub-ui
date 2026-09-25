'use client'

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

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'security', label: 'Security' },
  { value: 'workspace', label: 'Workspace' },
]

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
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="space-y-1">
        <h1 className="text-foreground text-[24px] font-medium tracking-tight">
          Your account
        </h1>
        <p className="text-muted-foreground text-[14px]">
          Your details and how Foxy HUB behaves for you.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full gap-8">
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
