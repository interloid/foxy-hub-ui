/**
 * MOCK - the AI updates page runs on this until it is wired to real project data and a
 * model. Each project carries what the draft summarises; the real version would read the
 * week's `activity_events`, `milestones` and pending `deliveries` instead.
 */

export interface AiUpdateProject {
  id: string
  name: string
  clientName: string
  clientContact: string
  /** Tailwind background for the initials avatar in the project picker. */
  avatarClass: string
  /** How many activity entries the draft was "built from" - shown under the preview. */
  activityCount: number
  progress: string[]
  milestones: {
    title: string
    status: 'done' | 'in_progress' | 'upcoming'
    due: string
  }[]
  pendingApprovals: string[]
}

export const MOCK_AI_UPDATE_PROJECTS: AiUpdateProject[] = [
  {
    id: 'mock-nordwave',
    name: 'Nordwave Rebrand & Site',
    clientName: 'Nordwave Coffee',
    clientContact: 'Erik',
    avatarClass: 'bg-info',
    activityCount: 14,
    progress: [
      'Finalised the logo suite (v4) and exported every lockup',
      'Built the homepage hero and product grid in staging',
      'Logged 32 hours across design and front-end',
    ],
    milestones: [
      { title: 'Brand identity', status: 'done', due: 'Jun 28' },
      { title: 'Website build', status: 'in_progress', due: 'Jul 21' },
      { title: 'Launch & handover', status: 'upcoming', due: 'Aug 4' },
    ],
    pendingApprovals: ['Logo_Suite_v4.zip', 'Homepage_hero.png'],
  },
  {
    id: 'mock-bloom',
    name: 'Bloom Launch Campaign',
    clientName: 'Bloom Skincare',
    clientContact: 'Priya',
    avatarClass: 'bg-primary',
    activityCount: 9,
    progress: [
      'Shot and edited the hero product video',
      'Drafted launch-week social posts for review',
    ],
    milestones: [
      { title: 'Creative direction', status: 'done', due: 'Jun 20' },
      { title: 'Campaign assets', status: 'in_progress', due: 'Jul 14' },
      { title: 'Launch week', status: 'upcoming', due: 'Jul 28' },
    ],
    pendingApprovals: ['Launch_video_cut2.mp4'],
  },
  {
    id: 'mock-harbor',
    name: 'Harbor App Redesign',
    clientName: 'Harbor Financial',
    clientContact: 'Sam',
    avatarClass: 'bg-success',
    activityCount: 6,
    progress: [
      'Completed usability tests with five customers',
      'Reworked the onboarding flow from the findings',
    ],
    milestones: [
      { title: 'Research', status: 'done', due: 'Jun 30' },
      { title: 'UX redesign', status: 'in_progress', due: 'Jul 25' },
    ],
    pendingApprovals: [],
  },
]
