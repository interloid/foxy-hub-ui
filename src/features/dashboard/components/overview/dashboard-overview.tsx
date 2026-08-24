'use client'

import { DashboardData } from '../../types'
import { ActiveProjects } from '../widgets/active-projects'
import { PendingApprovals } from '../widgets/pending-approvals'
import { RecentActivity } from '../widgets/recent-activity'
import { TeamCapacity } from '../widgets/team-capacity'
import { DashboardHeaders } from './dashboard-headers'
import { StatsGrid } from './stats-grid'
import { StudioPlanCard } from './studio-plan-card'

interface DashboardOverviewProps {
  data: DashboardData
}

export function DashboardOverview({ data }: DashboardOverviewProps) {
  const isAdmin = data.role === 'owner' || data.role === 'admin'

  return (
    <div className="animate-fx-fade space-y-6 md:p-3 lg:p-0">
      <DashboardHeaders userName={data.userName} orgName={data.orgName} />
      <StatsGrid stats={data.stats} />

      {/* Grid ratio: 60% Left / 40% Right */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        {/* Main Content Column (60%) */}
        <div className="space-y-6 lg:col-span-3">
          <PendingApprovals approvals={data.approvals} />
          <ActiveProjects projects={data.projects} />
        </div>

        {/* Sidebar Column (40%) */}
        <div className="space-y-6 lg:col-span-2">
          <RecentActivity activities={data.activities} />
          <TeamCapacity
            capacities={data.capacities}
            overCount={data.capacityOverCount}
          />
          <StudioPlanCard planInfo={data.planInfo} isAdmin={isAdmin} />
        </div>
      </div>
    </div>
  )
}
