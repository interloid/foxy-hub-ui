# Auth + Multi-Tenant Dashboard

**Date:** 2026-09-01  
**Author:** @navaneethan-interloid  
**Target branch:** `main` ← `feature/dashboard-implementation`

---

## Summary of Changes

Builds out the two foundational surfaces of Foxy Hub: the full authentication/onboarding flow and the tenant-scoped workspace dashboard. Auth covers passwordless signup with workspace creation, password setup, sign-in, and recovery, with route access resolved at the network boundary in `src/proxy.ts`. The dashboard adds an org-scoped overview (projects, approvals, capacity, billing) backed by a new Supabase schema — 14 migrations, RLS on every table, and four Edge Functions handling Stripe checkout, webhooks, invoicing, and an overdue-invoice cron.

---

## Completed Items

- [x] Passwordless signup with workspace creation (org name + slug availability check)
- [x] Set-password, sign-in, and forgot-password flows
- [x] Route-based multi-tenant workspaces (`/[org]`) with membership-scoped access
- [x] Onboarding wizard: plan selection, Stripe checkout handoff, teammate invitations
- [x] Dashboard overview: active projects, pending approvals, team capacity, activity feed, plan/seat usage
- [x] New Project sheet: engagement models, retainer/fixed pricing, team allocation with capacity guardrails and owner override
- [x] Profile management (details + password change)
- [x] Database: 14 migrations, declarative schema, RLS policies on all tables, demo seed data
- [x] Edge Functions: `create-checkout`, `create-invoice`, `stripe-webhook`, `invoice-overdue-handler`
- [x] Theme system (Light/Dark/System) with pre-hydration paint, replacing `next-themes`
- [x] README rewritten to match the actual stack, structure, env vars, and deploy steps

---

## Known Issues / Limitations

| Issue / gap                                                                      | Impact                                                                                                                                                         | Follow-up                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Invitation emails depend on project SMTP being configured                        | Without custom SMTP the hosted project falls back to Supabase's built-in test mailer (heavily rate-limited), so invites may silently not arrive                | Configure Dashboard → Auth → Emails → SMTP before launch |
| Free-plan signups never redeem pending teammate invites                          | Invites are gated behind a completed Stripe checkout; the "Skip" dialog discloses this, but free-tier users lose queued invites                                | PROJ-###                                                 |
| `subscriptions` has no `invoice_id` column                                       | Stripe invoice id isn't persisted; only `stripe_payment_intent` is                                                                                             | Migration if needed                                      |
| No automated tests                                                               | All verification is manual                                                                                                                                     | PROJ-###                                                 |

---


## How to Verify — UI Walkthrough

> Demo credentials are in `supabase/migrations/20260811124449_seed_data.sql` (header comment).
> Never paste real passwords here — PR descriptions are searchable and stay in history forever.

1. Open the preview URL below (or run locally — see next section)
2. Sign up fresh, or sign in as a seeded account (see the seed file for the four demo roles: owner / admin / member / client)
3. Land on `/{org}` — the workspace dashboard

**Check each of these:**

| #   | Scenario                    | Steps                                                       | Expected result                                                                                                 | ✅  |
| --- | --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --- |
| 1   | Signup + workspace creation | `/onboard` → enter name, email, agency, slug                | Slug availability checks live; magic link sent; org created on confirm                                          |     |
| 2   | Set password → sign in      | Follow emailed link → set password → sign out → sign in     | Lands on `/{org}`; password never appears in the network tab                                                    |     |
| 3   | Tenant isolation            | Sign in as one org's user, request another org's `/{slug}`  | Blocked — no cross-tenant data                                                                                  |     |
| 4   | Plan checkout               | Onboard → choose a paid plan → complete Stripe test payment | Redirects to `/{org}?payment=success`, success card shows, `subscriptions` row gains customer id + card details |     |
| 5   | Teammate invitation         | Add a teammate during onboarding → complete checkout        | Row appears in `invitations`; invite email delivered                                                            |     |
| 6   | New Project sheet           | Dashboard → New Project → pick each engagement model        | Selected card shows its own colour; retainer/fixed fields toggle; project saves with the **correct** engagement |     |
| 7   | Allocation over-commitment  | Allocate a teammate past daily capacity                     | Warning box appears, override reason required, layout does not shift horizontally                               |     |
| 8   | Role permissions            | Sign in as member vs client                                 | Owner/admin-only actions hidden or rejected                                                                     |     |

**States to confirm:** loading · empty · error · success  
**Viewports:** mobile · tablet · desktop

---

## How to Run + Config, Env & Flags

```bash
git checkout feature/dashboard-implementation
npm install
cp .env.example .env.local   # fill values, see table below
npm run dev                  # http://localhost:3000
```

Requires **Node 24.x** (`engines` in `package.json`) and the Supabase CLI.

**New / changed env vars**

| Variable                                              | Purpose                                            | Where to set         | Client-exposed?     |
| ----------------------------------------------------- | -------------------------------------------------- | -------------------- | ------------------- |
| `NEXT_PUBLIC_SITE_URL`                                | Base URL for auth redirects                        | `.env.local`, Vercel | ⚠️ Yes — no secrets |
| `NEXT_PUBLIC_SUPABASE_URL`                            | Supabase project URL                               | `.env.local`, Vercel | ⚠️ Yes — no secrets |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                       | Anon key; RLS is what authorises                   | `.env.local`, Vercel | ⚠️ Yes — no secrets |
| `SUPABASE_SERVICE_ROLE_KEY`                           | Bypasses RLS; used only by `lib/supabase/admin.ts` | `.env.local`, Vercel | No — server only    |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`               | Error monitoring; blank disables it                | `.env.local`, Vercel | Partly              |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Source map upload at build time                    | Vercel               | No                  |
| `DEMO_ACCOUNT_EMAIL` / `DEMO_ACCOUNT_PASSWORD`        | Demo login                                         | `.env.local`, Vercel | No                  |

**Edge Function secrets** — set with `supabase secrets set`, _not_ in `.env.local`:

`STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `ALLOWED_ORIGINS` · `SITE_URL` · `webhook_secret` · `G_CLIENT_ID` · `G_CLIENT_SECRET` · `G_REFRESH_TOKEN`

**Feature flags:** none

**Setup required before merge:**

```bash
supabase db push                                    # 14 migrations
supabase functions deploy create-checkout
supabase functions deploy create-invoice
supabase functions deploy stripe-webhook
supabase functions deploy invoice-overdue-handler
supabase secrets set webhook_secret=<vault value>   # else the cron handler 500s
```

Also required: Stripe webhook endpoint pointed at `stripe-webhook`, Stripe price IDs matching `plans.price_id` (seeded in `20260729102721_seed_plans.sql`), and custom SMTP configured for invitation emails.

**Docs:** [README](./README.md) · [README → Supabase Edge Functions](./README.md#-supabase-edge-functions)

---

## Deployed URL

**Preview:** https://foxy-hub-amber.vercel.app/sign-in  
**Environment:** preview &nbsp;·&nbsp; **Data:** seeded

---

## Author Self-Check

- [ ] No `console.log` / debugger statements — 0 matches in `src/`
- [ ] No commented-out or dead code 
- [ ] `tsc` passes — no new type errors (clean after clearing stale `.next/types`)
- [ ] ESLint passes — **0 errors, 6 warnings** (unused vars + one React Compiler note)
- [ ] Prettier formatting applied — all files clean
- [ ] Production build succeeds — 13 routes generated
- [ ] No secrets, keys, or credentials committed — `.env.local` untracked; only empty placeholders in `.env.example`
