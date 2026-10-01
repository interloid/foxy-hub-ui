import { toISODate } from '@/lib/date'
import { z } from 'zod'
import {
  NO_SIGN_OFF,
  readAmount,
  retainerPeriodSchema,
  updateCadenceSchema,
  type BillingModel,
  type NewProjectWizardValues,
} from './schema'

// What the wizard sends to `createProjectFromWizard`. Plain strings and numbers only:
// dates are converted to `YYYY-MM-DD` in the BROWSER, because a Date built from the picker
// is local midnight and `toISODate` on the server would read it in the server's zone.

const isoDate = z.iso.date()
const nullableText = (max: number) => z.string().trim().max(max).nullable()
const positive = (max: number) => z.number().positive().max(max).nullable()

export const createProjectPayloadSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    clientId: z.guid().nullable(),
    ownerId: z.guid().nullable(),
    startDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),

    scopeIn: nullableText(2000),
    scopeOut: nullableText(2000),
    doneWhen: nullableText(300),
    signOffBy: nullableText(150),
    updateCadence: updateCadenceSchema,
    milestones: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(150),
          dueDate: isoDate.nullable(),
          estimatedHours: positive(999_999.99),
          clientVisible: z.boolean(),
        })
      )
      .min(1, 'Add at least one milestone'),

    // `contract` in the wizard is the existing `fixed` engagement.
    engagement: z.enum(['fixed', 'budget', 'hourly', 'retainer']),
    contractValue: positive(9_999_999_999.99),
    estimatedHours: positive(999_999.99),
    retainerAmount: positive(9_999_999_999.99),
    retainerHours: positive(9_999.99),
    retainerPeriod: retainerPeriodSchema.nullable(),
    retainerOverage: z.number().nonnegative().max(99.99).nullable(),

    allocations: z.array(
      z.object({
        userId: z.guid(),
        hoursPerDay: z.number().min(0.25).max(24),
        daysPerWeek: z.number().int().min(1).max(7),
        rate: z.number().nonnegative().max(9_999_999_999.99).nullable(),
        effectiveFrom: isoDate,
      })
    ),
    overrideReason: nullableText(500),
    description: nullableText(1000),
  })
  // Hourly bills every hour at the bill rate and has no fee to fall back on, so a
  // teammate without a rate would never be invoiced. Mirrors `requiresBillRate`.
  .refine(
    (data) =>
      data.engagement !== 'hourly' ||
      data.allocations.every((a) => a.rate !== null && a.rate > 0),
    {
      path: ['allocations'],
      message: 'Every teammate needs a bill rate on an Hourly project.',
    }
  )

export type CreateProjectPayload = z.infer<typeof createProjectPayloadSchema>

const ENGAGEMENT_BY_MODEL: Record<
  BillingModel,
  CreateProjectPayload['engagement']
> = {
  contract: 'fixed',
  budget: 'budget',
  hourly: 'hourly',
  retainer: 'retainer',
}

function amountOrNull(raw?: string): number | null {
  const value = readAmount(raw)
  return value === undefined || Number.isNaN(value) ? null : value
}

function textOrNull(raw?: string): string | null {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

export function toCreateProjectPayload(
  values: NewProjectWizardValues
): CreateProjectPayload {
  const { basics, scope, billing, team } = values
  const model = billing.model

  return {
    name: basics.projectName.trim(),
    clientId: basics.clientId || null,
    ownerId: basics.ownerId || null,
    startDate: basics.kickoffDate ? toISODate(basics.kickoffDate) : null,
    dueDate: basics.targetEndDate ? toISODate(basics.targetEndDate) : null,

    scopeIn: textOrNull(scope.inScope),
    scopeOut: textOrNull(scope.outOfScope),
    doneWhen: textOrNull(scope.doneWhen),
    signOffBy:
      scope.signOffBy === NO_SIGN_OFF ? null : textOrNull(scope.signOffBy),
    updateCadence: scope.updateCadence,
    milestones: scope.milestones.map((m) => ({
      title: m.name.trim(),
      dueDate: m.dueDate ? toISODate(m.dueDate) : null,
      estimatedHours: amountOrNull(m.estimatedHours),
      clientVisible: m.clientVisible,
    })),

    engagement: ENGAGEMENT_BY_MODEL[model],
    // Only the selected model's fields are sent; the rest may hold values typed before
    // switching models.
    contractValue:
      model === 'contract'
        ? amountOrNull(billing.contractValue)
        : model === 'budget'
          ? amountOrNull(billing.budgetCap)
          : null,
    estimatedHours:
      model === 'contract' ? amountOrNull(billing.estimatedHours) : null,
    retainerAmount:
      model === 'retainer' ? amountOrNull(billing.retainerFee) : null,
    retainerHours:
      model === 'retainer' ? amountOrNull(billing.retainerHours) : null,
    retainerPeriod: model === 'retainer' ? billing.retainerPeriod : null,
    retainerOverage:
      model === 'retainer' ? amountOrNull(billing.retainerOverage) : null,

    allocations: team.allocations.map((row) => ({
      userId: row.memberId,
      hoursPerDay: Number(row.hoursPerDay),
      daysPerWeek: Number(row.daysPerWeek),
      rate: amountOrNull(row.billRate),
      effectiveFrom: toISODate(row.effectiveFrom),
    })),
    overrideReason: textOrNull(team.overrideReason),
    description: textOrNull(team.deliveryNotes),
  }
}
