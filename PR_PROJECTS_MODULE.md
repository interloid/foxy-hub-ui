**Date:** 2026-09-10
**Author:** @navaneethan-interloid
**Target branch:** `main` ← `feature/project-implementation`

---

## Summary of Changes

<!-- 2–4 sentences. What problem does this solve and what approach did you take?
     Don't list files here — that's what the diff is for. -->

Introduces the Projects module end-to-end: a projects list/overview, a project detail page (deliverables, milestones, time tracking, updates, invoicing), and the Supabase schema/functions/RLS backing it. Data access is split into typed query modules under `src/features/projects/queries/`, with server actions in `actions.ts` handling writes (deliverables, milestones, invoices, time entries, updates), and realtime updates wired via a dedicated hook.

**Ticket:** [PROJ-###](https://…) &nbsp;·&nbsp; **Type:** Feature
**Depends on:** none

---

## Completed Items

<!-- One line per acceptance criterion so the reviewer can tick them off against the ticket. -->

- [x] Projects overview page with table listing (`src/app/[org]/projects/page.tsx`, `projects-overview.tsx`, `project-table.tsx`)
- [x] Project detail page with header, progress, client/engagement meta cards (`src/app/[org]/projects/[id]/page.tsx`, `components/common/`, `components/meta/`)
- [x] Deliverables: list, create, and file attachment sheets (`components/deliverables/`)
- [x] Milestones: list and create sheet (`components/milestones/`)
- [x] Time tracking: hours summary, hours-burn, time entries, allocation end control (`components/time-tracking/`)
- [x] Project updates feed with input and realtime subscription (`components/updates/`, `hooks/use-realtime-updates.ts`)
- [x] Invoicing: new invoice sheet and invoice line generation (`components/meta/new-invoice-sheet.tsx`, `queries/get-invoice.ts`)
- [x] Team allocation and pricing logic for the new-project sheet (`dashboard/pricing.ts`, `new-project-sheet/`)
- [x] Supabase schema updates: invoice lines table + RLS, project allocations, payment terms, estimated hours, invoice-entry function, realtime for updates
- [x] Shared `fx-table` / `fx-tabs` components and loading skeletons (`skeleton/project-detail.tsx`, `skeleton/table-row.tsx`)

---

## Known Issues / Limitations

<!-- Anything you're knowingly shipping with, plus anything intentionally left out.
     Write "None known" rather than deleting the section — silence reads as "didn't check". -->

| Issue / gap | Impact | Follow-up |
|---|---|---|
| Old flat `src/features/projects/components/*.tsx` files were removed and re-organized into subfolders (`common/`, `meta/`, `deliverables/`, `milestones/`, `time-tracking/`, `updates/`, `overview/`) | Large diff churn on review; no functional regression expected but worth a careful pass | PROJ-### |
| Several new Supabase migrations (allocations, invoice lines, payment terms, estimated hours, invoice-entry function) | Must be applied to any environment before the app will work end-to-end | PROJ-### |

---

## Reviewer Notes / Areas to Focus On

**Look closely at:**

| Area | What to verify | Why it matters |
|---|---|---|
| `src/features/projects/actions.ts` | Server action validation, auth/org scoping on writes | New write surface for deliverables, milestones, invoices, time entries |
| `src/features/projects/queries/get-invoice.ts` | Invoice line calculation and totals | Financial data, highest blast radius if wrong |
| `supabase/schemas/policies/18_rls_invoice_lines.sql` | RLS correctly scopes invoice lines to org/membership | Security-sensitive: invoice data must not leak across orgs |
| `supabase/migrations/20260905101032_create_invoice_entry_function.sql` | DB function logic for invoice entry generation | Runs server-side, hard to unit test from the UI |
| `src/features/projects/hooks/use-realtime-updates.ts` | Subscription setup/teardown, no leaked channels | Realtime subscriptions are easy to leak across navigations |
| `src/features/dashboard/pricing.ts` | Rate/pricing calculations feeding the new-project sheet | New logic, no existing tests to lean on |

**Safe to skim:** `src/types/supabase.ts` (generated types), `package-lock.json`, file moves/renames under `src/features/projects/components/`

**Open questions for you:**
1. Should the deleted flat component files (`client-card.tsx`, `deliverables-card.tsx`, `engagement-card.tsx`, `hours-burn-card.tsx`, `hours-summary-cards.tsx`, `latest-update-card.tsx`, `milestones-list-card.tsx`, `new-invoice-sheet.tsx`, `progress-card.tsx`, `project-detail-header.tsx`, `project-detail-view.tsx`, `project-overview.tsx`, `project-table.tsx`, `time-entries-card.tsx`, `update-input.tsx`) be confirmed as fully superseded by their new subfolder counterparts before merge?

---

## How to Verify — UI Walkthrough

> Credentials live in the README (**Test Accounts**) or the shared vault. Never paste real
> passwords here — PR descriptions are searchable and stay in history forever.

1. Open the preview URL below (or run locally — see next section)
2. Log in as `qa.user@example.com` — password in `README.md` → *Test Accounts*
3. Navigate to **[org]/projects**
4. Open a project to reach the detail view, then exercise deliverables, milestones, time tracking, updates, and invoicing tabs

**Check each of these:**

| # | Scenario | Steps | Expected result | ✅ |
|---|---|---|---|---|
| 1 | Projects list loads | Navigate to `/[org]/projects` | Table renders with correct project data |  |
| 2 | Project detail loads | Click into a project | Header, progress, client/engagement cards render |  |
| 3 | Create deliverable | Open create-deliverable sheet, submit | New deliverable appears in list, file sheet works |  |
| 4 | Create milestone | Open create-milestone sheet, submit | New milestone appears in list |  |
| 5 | Log time / end allocation | Use time-tracking controls | Entry recorded, hours-burn updates |  |
| 6 | Post update | Use update input | Update appears in feed in realtime |  |
| 7 | Create invoice | Open new-invoice sheet, submit | Invoice lines generated correctly |  |

**States to confirm:** loading · empty · error · success
**Viewports:** mobile · tablet · desktop
**Not verified:** <!-- be specific — this is what tells the reviewer where to look hardest -->

---

## How to Run + Config, Env & Flags

```bash
git checkout feature/project-implementation
pnpm install
cp .env.example .env.local   # fill values, see table below
pnpm dev                     # http://localhost:3000
```

**New / changed env vars**

| Variable | Purpose | Where to set | Client-exposed? |
|---|---|---|---|
| _None new_ | Existing `NEXT_PUBLIC_SUPABASE_URL` / Sentry vars are reused | `.env.local`, Vercel | ⚠️ Yes — no secrets |

**Feature flags:** none
**Setup required before merge:** Apply the new Supabase migrations (`supabase db push` / `supabase migration up`) — includes `add_estimated_hours`, `add_payment_terms`, `update_project_allocations`, `create_invoice_entry_function`, `update_invoice_entries_membership`, `add_updates_realtime`, `update_project_schema`, and `seed_demo_data`.

**Docs:** [README](README.md) · [supabase/schemas](supabase/schemas)

---

## Deployed URL

<!-- Deep-link to the screen that changed, not the homepage. -->

**Preview:** https://…
**Environment:** preview / staging &nbsp;·&nbsp; **Data:** seeded / real

---

## Author Self-Check

- [ ] No `console.log` / debugger statements
- [ ] `tsc` passes — no new type errors
- [ ] Prettier formatting applied
- [ ] Production build succeeds
- [ ] No secrets, keys, or credentials committed
