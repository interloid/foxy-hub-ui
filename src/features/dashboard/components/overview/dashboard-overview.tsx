import { isAdminRole } from '@/lib/role'
import { DashboardData } from '../../types'
import { ActiveProjects } from '../widgets/active-projects'
import { PendingApprovals } from '../widgets/pending-approvals'
import { RecentActivity } from '../widgets/recent-activity'
import { TeamCapacity } from '../widgets/team-capacity'
import { TeamCapacityCard } from '../widgets/team-capacity-card'
import { DashboardHeaders } from './dashboard-headers'
import { StatsGrid } from './stats-grid'
import { StudioPlanCard } from './studio-plan-card'

interface DashboardOverviewProps {
  data: DashboardData
}

export function DashboardOverview({ data }: DashboardOverviewProps) {
  return (
    <div className="animate-fx-fade space-y-6 md:p-3 lg:p-0">
      <DashboardHeaders
        userName={data.userName}
        orgName={data.orgName}
        role={data.role}
      />
      <StatsGrid stats={data.stats} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-20">
        <div className="space-y-6 lg:col-span-11">
          <PendingApprovals approvals={data.approvals} />
          <ActiveProjects projects={data.projects} />
        </div>

        <div className="space-y-6 lg:col-span-9">
          <RecentActivity activities={data.activities} />
          {isAdminRole(data.role) ? (
            <TeamCapacityCard
              capacities={data.capacities}
              overCount={data.capacityOverCount}
            />
          ) : (
            <TeamCapacity
              capacities={data.capacities}
              overCount={data.capacityOverCount}
            />
          )}
          {isAdminRole(data.role) && (
            <StudioPlanCard
              planInfo={data.planInfo}
              isAdmin={isAdminRole(data.role)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
