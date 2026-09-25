# Foxy Hub — Senior Developer Review (2026-09-18)

Overall: this is a **seriously well-built codebase** for its stage — real multi-tenant architecture, thoughtful RLS design, and evidence of a team that fixes root causes (SQL comments literally document past incidents and their fixes). It's not a toy project. But there's one **critical, currently-live bug** that undermines the entire billing/approval workflow, plus a handful of real gaps worth fixing before you'd call this production-hardened.

## Pros

- **RLS architecture is genuinely sophisticated.** `has_org_role()`/`is_org_member()` are `SECURITY DEFINER` helpers specifically built to avoid infinite recursion when a `memberships` policy needs to query `memberships` itself — a subtle problem solved correctly.
- **History of real hardening, not cargo-culting.** Migration/schema comments document actual incidents: cross-client data leaks that were found and fixed (`03_rls_projects.sql`, `08_rls_invoices.sql`), and a signup trigger that used to trust a client-supplied `org_id`/`role` (a full tenant-takeover bug) that was caught and fixed.
- **Billing correctness is well thought through**: unbilled hours are claimed atomically with invoice creation (`create_invoice_with_entries`), a partial unique index prevents double-billing a retainer period, and `invoice_lines` freezes what a client was actually shown.
- **Stripe webhook handling is done right**: signature verification, idempotency via a claim row, billing writes ordered before side effects, and failure paths that let Stripe safely retry.
- **Defense in depth in the app layer**: the DAL (`src/lib/dal.ts`) re-derives `org_id` from a real membership row on every read rather than trusting client-supplied context; `src/proxy.ts` correctly implements Next 16's session-refresh pattern and fails closed.
- **Code hygiene**: TypeScript strict mode, zero `any`/`@ts-ignore`, zero `TODO`/`FIXME` in `src/`. Consistent Zod validation on forms and server actions. Custom theme provider avoids FOUC and hydration mismatches correctly.

## Cons / Weaknesses

- **Zero automated tests anywhere in the repo.** For a codebase this deliberate about billing correctness, that's the single biggest structural gap — and it's exactly why the critical bug below shipped silently.
- **Inconsistent authorization pattern** in `src/features/projects/actions.ts`: most mutations check `getWorkspace()` + admin role before acting, but `updateMilestoneWithValidation`, `updateProjectWithValidation`, and `postUpdateAction` skip that check and rely entirely on RLS as the only backstop. Works today, but it's an easy trap for a future contributor who copies the "safe-looking" pattern from the wrong neighbor.
- **Duplicated, drifting money-moving code paths**: an unused `create-invoice` edge function and an unused invoice-payment branch in `create-checkout` coexist with the real Postgres RPC path, each with different validation — dead code with live billing implications.
- Password reset (`sendPasswordReset`) has no rate limiting, unlike sign-in right next to it.
- `password-encoding.ts` is plain base64 — not encryption, could mislead a future maintainer into thinking it provides confidentiality.
- Overdue-invoice emails route through a personal Gmail OAuth token rather than a transactional email provider — fragile for production billing comms.

## Bugs

### 🔴 Critical — billable time entries can be self-approved/edited after the fact

`supabase/schemas/policies/09_rls_time_entries.sql:39-42`, regression introduced in `supabase/migrations/20260915122648_update_time_entries_rls.sql:6` (verified directly). The policy `own_update_draft_entries` is supposed to let users edit only their own **draft** entries — but it silently dropped the `status = 'draft'` condition that existed in the original schema. Today it's just `user_id = auth.uid()`, no status check at all.

Since Postgres RLS gates rows, not columns, any authenticated user can bypass the app UI entirely and hit Supabase's REST API directly:

```js
supabase.from('time_entries').update({ status: 'approved', duration_minutes: 1200 }).eq('id', myEntryId)
```

A user can inflate hours on an already-*approved* entry before it's invoiced, self-approve their own submitted entries (bypassing `approve_time_entry()`'s admin check), or flip a rejected entry back to draft and delete it. This is a live billing-fraud vector, not a hypothetical.

**Fix**: add `and status = 'draft'` back to both the `USING` and `WITH CHECK` clauses of `own_update_draft_entries`.

### 🟠 High — time-entry capacity check is bypassable

The daily-hours-capacity guard only lives inside the `create_time_entry_with_capacity_check()` RPC — the underlying `INSERT` policy (`members_insert_entries`) and table constraint (`check (duration_minutes > 0)`, no upper bound) don't enforce it. A direct `INSERT` via the REST API with `duration_minutes: 100000` sails through.

### 🟡 Medium

- `check_email_exists` RPC is granted to `anon` — lets anyone enumerate registered emails via `POST /rest/v1/rpc/check_email_exists`, unauthenticated.
- `supabase/functions/create-checkout/index.ts:181-211` — the subscription-checkout branch takes `orgId` from the request body with no check that the caller belongs to it; only safe today because the one current caller derives it server-side, but it's a public endpoint gated on nothing but a valid JWT.
- Same file's invoice-payment branch never checks `invoice.status`, unlike its sibling `create-invoice` — an already-paid invoice could theoretically be paid twice.
- `src/app/[org]/projects/page.tsx:60-62` — `parseInt(page)` isn't validated; `?page=abc` silently renders "no projects" instead of clamping or erroring.
- `global-error.tsx`/`[org]/error.tsx` never call `Sentry.captureException` — despite Sentry being wired up, the exact crashes these boundaries exist for are invisible in monitoring.
- `src/features/projects/actions.ts:475-555` / `:557-643` — `updateMilestoneWithValidation` and `updateProjectWithValidation` have no app-level `getWorkspace`/role check, relying entirely on RLS as the only backstop, inconsistent with sibling actions in the same file.
- `src/lib/week.ts` computes week boundaries in UTC while `src/lib/date.ts`/`working-days.ts` operate in local time — off-by-one-day risk in weekly time aggregation near timezone boundaries.
- `src/features/time/action.ts:58-74` — bulk approve/reject uses `Promise.all` per-ID; a partial failure leaves some rows already mutated but reports `success: false, updatedCount: 0`.

### 🟢 Low

- The "Log in as client" demo button (`sign-in-form.tsx`) actually calls the same `signInAsDemo()` as "Log in as admin" — there's only one hardcoded demo account, so the client persona doesn't exist and silently logs in as admin.
- `sendPasswordReset` has no rate limiting (email-bombing/enumeration-timing).
- A few `await isAdminRole(...)` calls await a non-async function — harmless but misleading.
- `src/proxy.ts` `PUBLIC_ROUTES` includes `/sign-up`, which doesn't exist anywhere in `src/app` (only `/onboard`) — dead entry.
- `src/hooks/use-mobile.ts` `getServerSnapshot` always returns `false`; any consumer that branches markup (not just CSS) on `useIsMobile()` will show a one-frame flash of desktop layout on real mobile devices.

## Bottom line

Fix the time-entries RLS regression before anything else touches production — it's a one-line SQL fix with real financial-integrity consequences. Everything else is solid-to-good engineering with normal pre-launch rough edges, and the near-total absence of tests is the root cause worth investing in next so this class of regression gets caught by CI instead of a code review.
