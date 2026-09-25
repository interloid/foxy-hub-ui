/**
 * The Monday digest email — same look as supabase/templates/*.html (the auth emails).
 *
 * Raw hex and inline styles on purpose: mail clients strip <style> and ignore CSS custom
 * properties. Every user-supplied string (workspace, project, milestone names) goes
 * through escapeHtml.
 */
import type { DigestContent } from './content.ts'
import { formatDay, formatRange, type DigestWeek } from './time.ts'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hours(minutes: number): string {
  const value = Math.round((minutes / 60) * 10) / 10
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount)} ${currency}`
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export type DigestEmail = { subject: string; html: string; text: string }

type Section = { title: string; lines: { html: string; text: string }[]; link?: { href: string; label: string } }

export function renderDigest(params: {
  firstName: string | null
  orgName: string
  orgSlug: string
  currency: string
  appUrl: string
  unsubscribeUrl: string
  week: DigestWeek
  content: DigestContent
  isTest?: boolean
}): DigestEmail {
  const { content, appUrl, orgSlug, week } = params
  const org = escapeHtml(params.orgName)
  const base = `${appUrl}/${encodeURIComponent(orgSlug)}`
  const sections: Section[] = []

  // --- Your week -----------------------------------------------------------------------
  const { loggedMinutes, capacityMinutes } = content.hours
  const yourWeek: Section['lines'] = [
    {
      html: `You logged <strong>${hours(loggedMinutes)}</strong> of ${hours(capacityMinutes)}.`,
      text: `You logged ${hours(loggedMinutes)} of ${hours(capacityMinutes)}.`,
    },
  ]
  if (content.openEntries.rejected) {
    const n = content.openEntries.rejected
    const s = `${plural(n, 'entry', 'entries')} ${n === 1 ? 'was' : 'were'} sent back to you — fix and resubmit.`
    yourWeek.push({ html: s, text: s })
  }
  if (content.openEntries.draft) {
    const s = plural(content.openEntries.draft, 'draft entry', 'draft entries')
    yourWeek.push({ html: `${s} still to submit.`, text: `${s} still to submit.` })
  }
  sections.push({ title: 'Your week', lines: yourWeek, link: { href: `${base}/time`, label: 'Open timesheets' } })

  // --- Needs your attention (approvers / admins) ---------------------------------------
  const attention: Section['lines'] = []
  if (content.approvals?.count) {
    const s = `${plural(content.approvals.count, 'timesheet entry', 'timesheet entries')} (${hours(content.approvals.minutes)})`
    attention.push({ html: `<strong>${s}</strong> waiting for your approval.`, text: `${s} waiting for your approval.` })
  }
  if (content.deliveriesAwaitingClient) {
    const s = plural(content.deliveriesAwaitingClient, 'delivery', 'deliveries')
    attention.push({ html: `${s} waiting on client approval.`, text: `${s} waiting on client approval.` })
  }
  if (content.invoices?.overdueCount) {
    const s = `${plural(content.invoices.overdueCount, 'invoice')} overdue (${money(content.invoices.overdueAmount, params.currency)})`
    attention.push({ html: `<strong>${s}</strong>.`, text: `${s}.` })
  }
  if (content.invoices?.dueThisWeekCount) {
    const s = `${plural(content.invoices.dueThisWeekCount, 'invoice')} due this week`
    attention.push({ html: `${s}.`, text: `${s}.` })
  }
  for (const project of content.overBudget ?? []) {
    const name = escapeHtml(project.name)
    attention.push({
      html: `<a href="${base}/projects/${project.projectId}" style="color:#c2410c;">${name}</a> is over budget — ${project.loggedHours}h of ${project.estimatedHours}h.`,
      text: `${project.name} is over budget — ${project.loggedHours}h of ${project.estimatedHours}h.`,
    })
  }
  if (attention.length) {
    sections.push({
      title: 'Needs your attention',
      lines: attention,
      link: content.approvals?.count ? { href: `${base}/time`, label: 'Review approvals' } : undefined,
    })
  }

  // --- Due this week ------------------------------------------------------------------
  if (content.milestones.length) {
    sections.push({
      title: 'Due this week',
      lines: content.milestones.map((m) => ({
        html: `<a href="${base}/projects/${m.projectId}" style="color:#c2410c;">${escapeHtml(m.title)}</a> · ${escapeHtml(m.projectName)} · ${formatDay(m.dueDate)}`,
        text: `${m.title} · ${m.projectName} · ${formatDay(m.dueDate)}`,
      })),
    })
  }

  const range = formatRange(week.lastWeekStart, week.lastWeekEnd)
  const greeting = params.firstName ? `Good morning, ${escapeHtml(params.firstName)}` : 'Good morning'
  const subject = `${params.isTest ? '[Test] ' : ''}Your week at ${params.orgName} · ${range}`

  const sectionHtml = sections
    .map(
      (section) => `
                <h2 style="margin:24px 0 8px;font-size:15px;line-height:22px;font-weight:600;color:#1c1917;">${section.title}</h2>
                ${section.lines
                  .map(
                    (line) =>
                      `<p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#57534e;">${line.html}</p>`
                  )
                  .join('\n                ')}
                ${
                  section.link
                    ? `<p style="margin:10px 0 0;"><a href="${section.link.href}" style="display:inline-block;padding:9px 16px;border-radius:8px;background-color:#e8651a;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">${section.link.label}</a></p>`
                    : ''
                }`
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f7f5f1;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f5f1;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
            <tr>
              <td style="padding:0 4px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:28px;height:28px;border-radius:6px;background-color:#e8651a;color:#ffffff;font-size:15px;font-weight:700;text-align:center;line-height:28px;">F</td>
                    <td style="padding-left:10px;font-size:15px;font-weight:600;color:#1c1917;">Foxy HUB</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid #e7e2da;border-radius:12px;padding:32px 28px;">
                ${params.isTest ? '<p style="margin:0 0 16px;padding:8px 12px;border-radius:8px;background-color:#f7f5f1;font-size:12px;color:#57534e;">This is a test digest, sent from Settings.</p>' : ''}
                <h1 style="margin:0 0 4px;font-size:20px;line-height:28px;font-weight:600;color:#1c1917;">${greeting}</h1>
                <p style="margin:0;font-size:14px;line-height:22px;color:#8a847a;">Your week at ${org} · ${range}</p>
${sectionHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#8a847a;">
                You get this because the weekly digest is on in your Foxy HUB settings.
                <a href="${params.unsubscribeUrl}" style="color:#8a847a;">Unsubscribe</a><br />
                Foxy HUB &middot; Interloid Studio
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    params.isTest ? '[Test digest, sent from Settings]\n' : '',
    `${params.firstName ? `Good morning, ${params.firstName}` : 'Good morning'}`,
    `Your week at ${params.orgName} · ${range}`,
    '',
    ...sections.flatMap((section) => [
      section.title.toUpperCase(),
      ...section.lines.map((line) => `- ${line.text}`),
      ...(section.link ? [`${section.link.label}: ${section.link.href}`] : []),
      '',
    ]),
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join('\n')

  return { subject, html, text }
}
