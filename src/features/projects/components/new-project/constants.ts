export type NewProjectStepId = 'basics' | 'scope' | 'billing' | 'team'

export interface NewProjectStep {
  id: NewProjectStepId
  title: string
  description: string
  nextLabel: string
  footerHint: string
}

const DEFAULT_FOOTER_HINT = 'Nothing is created until the last step.'

export const NEW_PROJECT_STEPS: NewProjectStep[] = [
  {
    id: 'basics',
    title: 'Basics',
    description: 'Name, client, dates',
    nextLabel: 'Next: scope',
    footerHint: DEFAULT_FOOTER_HINT,
  },
  {
    id: 'scope',
    title: 'Scope & milestones',
    description: 'What is in, what is out, milestones',
    nextLabel: 'Next: billing',
    footerHint:
      "Milestones here become the client's timeline and the delivery bar in health.",
  },
  {
    id: 'billing',
    title: 'How it bills',
    description: 'Engagement model and money',
    nextLabel: 'Next: team',
    footerHint: 'Only the fields this billing model needs are shown.',
  },
  {
    id: 'team',
    title: 'Team & capacity',
    description: 'Who works on it, and capacity',
    nextLabel: 'Create project',
    footerHint: "Capacity is checked against everyone's other projects.",
  },
]
