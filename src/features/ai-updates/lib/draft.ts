import type { AiUpdateProject } from '../mock-data'

export type AiUpdateTone = 'professional' | 'warm' | 'brief'

export interface AiUpdateSections {
  progress: boolean
  milestones: boolean
  approvals: boolean
}

const MILESTONE_STATUS: Record<
  AiUpdateProject['milestones'][number]['status'],
  string
> = {
  done: 'done',
  in_progress: 'in progress',
  upcoming: 'up next',
}

/**
 * MOCK - stands in for the model. Builds the client update from the project's data with a
 * fixed template per tone, so the page behaves like the real thing: what you include and
 * the tone you pick change what comes back.
 */
export function buildMockDraft(
  project: AiUpdateProject,
  tone: AiUpdateTone,
  include: AiUpdateSections
): string {
  const brief = tone === 'brief'
  const bullets = (items: string[]) =>
    items.map((item) => `- ${item}`).join('\n')
  const sections: string[] = []

  if (include.progress && project.progress.length > 0) {
    sections.push(
      `${brief ? 'This week' : 'Progress this week'}\n${bullets(project.progress)}`
    )
  }

  if (include.milestones && project.milestones.length > 0) {
    sections.push(
      `Milestones\n${bullets(
        project.milestones.map(
          (m) =>
            `${m.title} - ${MILESTONE_STATUS[m.status]}${
              m.status === 'done' ? '' : `, due ${m.due}`
            }`
        )
      )}`
    )
  }

  if (include.approvals) {
    sections.push(
      project.pendingApprovals.length > 0
        ? `${brief ? 'Needs your sign-off' : 'Waiting on your approval'}\n${bullets(
            project.pendingApprovals
          )}`
        : brief
          ? 'Nothing waiting on you.'
          : 'Nothing is waiting on your approval right now.'
    )
  }

  const body = sections.join('\n\n')

  if (brief) {
    return `${project.name} - weekly update\n\n${body}`
  }

  if (tone === 'warm') {
    return [
      `Hi ${project.clientContact},`,
      `Hope you've had a good week! Here's where things are on ${project.name}.`,
      body,
      'Shout if anything looks off - always happy to jump on a call.',
      'Cheers,',
    ].join('\n\n')
  }

  return [
    `Hi ${project.clientContact},`,
    `Here is this week's status update for ${project.name}.`,
    body,
    'Please let us know if you have any questions.',
    'Best regards,',
  ].join('\n\n')
}
