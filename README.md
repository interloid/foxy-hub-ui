# 🦊 Foxy Hub | Agency Client Portal

Foxy Hub is a multi-tenant agency client portal, project management, and billing platform designed to streamline operations, collaboration, and subscription management between agencies and their clients.

Built with the Next.js App Router, TypeScript, and a security-first backend architecture powered by Supabase and Stripe.

**🔗 Live app:** [foxy-hub-amber.vercel.app](https://foxy-hub-amber.vercel.app/sign-in)

---

## 🛠️ Tech Stack

| Area           | Choice                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, React Server Components)                            |
| Runtime        | React 19 — with the React Compiler enabled                                  |
| Language       | TypeScript 5 (strict mode)                                                  |
| Styling        | Tailwind CSS v4 (`@tailwindcss/postcss`)                                    |
| UI             | shadcn/ui, Base UI, Radix UI, plus the in-house `Fx*` design primitives     |
| Icons          | Lucide React                                                                |
| Charts         | Recharts                                                                    |
| Forms          | React Hook Form + Zod resolvers                                             |
| Validation     | Zod 4 (forms, server action inputs, runtime env parsing)                    |
| Backend & Auth | Supabase (`@supabase/ssr`, Postgres RLS, Edge Functions)                    |
| Billing        | Stripe Checkout + webhooks                                                  |
| Monitoring     | Sentry (optional — no-op when the DSN is blank)                             |
| Theming        | Custom provider in `src/context/theme-provider.tsx` (Light / Dark / System) |

> **Note on theming:** this project does **not** use `next-themes`. Theme state lives in
> `src/context/theme-provider.tsx` and `src/lib/theme.ts`, which pairs a `useSyncExternalStore`
> provider with a blocking `themeInitScript` in the document head so the correct theme is painted
> before hydration. The default is `system`; an explicit choice is persisted to `localStorage.theme`.

---

## 📁 Project Architecture

A modular, domain-driven structure that isolates server actions, route guards, schemas, and shared design primitives.

```
foxy-hub-ui/
├── src/
│   ├── app/                  # App Router routes, layouts, loading states
│   │   ├── (auth)/           # sign-in, onboard, set-password, forgot-password
│   │   ├── [org]/            # Tenant-scoped workspace (dashboard, profile, billing)
│   │   ├── api/              # Route handlers
│   │   └── auth/             # OAuth / magic-link callback + confirm handlers
│   ├── actions/              # Shared server actions
│   ├── components/
│   │   ├── ui/               # Primitive shadcn/ui base elements
│   │   ├── shared/           # Design system tokens (FxCard, FxButton, FxField, FxSheet)
│   │   ├── layout/           # Sidebar, navigation, and header layouts
│   │   ├── billing/          # Billing and payment surfaces
│   │   └── common/           # Cross-cutting helpers
│   ├── features/             # Feature-based domain logic
│   │   ├── auth/             # Sign-in, password, session flows
│   │   ├── onboarding/       # Workspace signup wizard, plan checkout, invitations
│   │   ├── dashboard/        # Projects, allocations, deliveries, activity
│   │   └── profile/          # Account management
│   ├── config/
│   │   ├── env.ts            # Type-safe Zod parser for public env vars
│   │   ├── env.server.ts     # Server-only env vars (never bundled to the client)
│   │   ├── site.ts           # Site metadata
│   │   └── nav.ts            # Navigation definitions
│   ├── context/              # Root-level React providers (theme)
│   ├── lib/                  # Infrastructure & utilities
│   │   ├── dal.ts            # Data Access Layer & DTO types
│   │   ├── supabase/         # Browser, server, and admin client factories
│   │   ├── theme.ts          # Theme storage, resolution, pre-hydration script
│   │   └── utils.ts          # Styling & formatting helpers
│   ├── hooks/                # Shared React hooks
│   ├── skeleton/             # Loading skeletons
│   ├── types/                # Shared app types + generated `supabase.ts`
│   └── proxy.ts              # Request proxying & route authentication guard
└── supabase/
    ├── migrations/           # Ordered SQL migrations (source of truth for deploys)
    ├── schemas/              # Declarative schema (tables, policies, functions, types)
    ├── functions/            # Deno Edge Functions
    ├── templates/            # Custom auth email templates
    ├── seed/                 # Demo seed data
    └── config.toml           # Local stack + per-function config
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 24.x** (see `engines` in `package.json`)
- npm
- [Supabase CLI](https://supabase.com/docs/guides/local-development) — for migrations, type generation, and edge functions

### 1. Installation

```bash
git clone git@github.com:interloid/foxy-hub-ui.git
cd foxy-hub-ui
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```bash
# --- Site ---
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME="Foxy Hub"
NEXT_PUBLIC_SITE_DESCRIPTION="Agency Client Portal & Project Platform"
NEXT_PUBLIC_TWITTER_HANDLE=      # optional, for twitter:site card metadata

# --- Supabase (public: URL + anon key only) ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# --- Supabase (server-only) ---
# Bypasses RLS completely. Never prefix with NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# --- Sentry (optional; blank disables it entirely) ---
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=               # build-time only, for source map upload

# --- Demo login (server-side only) ---
DEMO_ACCOUNT_EMAIL=demo@example.com
DEMO_ACCOUNT_PASSWORD=your-password
```

Environment variables are validated at startup by Zod (`src/config/env.ts` and
`src/config/env.server.ts`). Missing or malformed values fail fast rather than surfacing as
`undefined` at runtime.

> **Stripe and Gmail credentials do not belong here.** They are consumed by the Edge Functions,
> not the Next.js app — see [Edge Function secrets](#edge-function-secrets).

### 3. Database Setup

```bash
supabase db push          # apply migrations to the linked project
# or, against a local stack:
supabase db reset         # replay every migration from scratch + reseed

npm run typegen           # regenerate src/types/supabase.ts from the linked schema
```

### 4. Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## ⚡ Supabase Edge Functions

Four Deno functions live in `supabase/functions/`:

| Function                  | Purpose                                                                                                                                                  | JWT                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `create-checkout`         | Creates a Stripe Checkout session for a subscription plan or a one-off invoice                                                                           | `verify_jwt = false` |
| `create-invoice`          | Starts checkout for an existing unpaid invoice; authorises via the caller's own RLS                                                                      | `verify_jwt = true`  |
| `stripe-webhook`          | Handles `checkout.session.completed` and subscription lifecycle events; syncs `subscriptions`, marks invoices paid, redeems pending teammate invitations | `verify_jwt = false` |
| `invoice-overdue-handler` | Nightly cron job that flags overdue invoices and emails clients via Gmail                                                                                | `verify_jwt = false` |

Deploy them individually:

```bash
supabase functions deploy create-checkout
supabase functions deploy create-invoice
supabase functions deploy stripe-webhook
supabase functions deploy invoice-overdue-handler
```

### Edge Function secrets

Set with `supabase secrets set KEY=value` — these are **not** read from `.env.local`:

| Secret                                              | Used by                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                                 | `create-checkout`, `create-invoice`, `stripe-webhook`             |
| `STRIPE_WEBHOOK_SECRET`                             | `stripe-webhook` (signature verification)                         |
| `ALLOWED_ORIGINS`                                   | `create-checkout`, `create-invoice` (CORS + return-URL allowlist) |
| `SITE_URL`                                          | `stripe-webhook` (invitation redirect target)                     |
| `webhook_secret`                                    | `invoice-overdue-handler` (shared secret with the pg_cron job)    |
| `G_CLIENT_ID`, `G_CLIENT_SECRET`, `G_REFRESH_TOKEN` | `invoice-overdue-handler` (Gmail OAuth)                           |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected into the
function runtime automatically.

> **Invitation emails require SMTP.** `inviteUserByEmail` sends through the project's configured
> mail provider. Without custom SMTP (Dashboard → Authentication → Emails → SMTP Settings), a
> hosted project falls back to Supabase's built-in test mailer, which is heavily rate-limited.

---

## 🛡️ Security & Route Protection

- **Request guarding** — unauthenticated access and post-auth setup states are resolved at the
  network boundary in `src/proxy.ts` using `@supabase/ssr`.
- **Multi-tenancy** — every table has Row Level Security enabled, scoped through `memberships`.
  Helper functions (`has_org_role`, `is_org_member`, `current_user_orgs`) are `SECURITY DEFINER`
  with an empty `search_path`.
- **Key separation** — browser and server components query through the ANON key so RLS applies.
  The service-role key is confined to `src/lib/supabase/admin.ts`, which is guarded by
  `import 'server-only'`, and to the Edge Functions.
- **Webhook integrity** — `stripe-webhook` verifies Stripe signatures and claims each event in
  `stripe_events` for idempotency before doing any work.

---

## 📜 Code Style & Quality

```bash
npm run lint      # ESLint (eslint-config-next + prettier config)
npm run format    # Prettier across src/
npx tsc --noEmit  # Type check
```

Husky and lint-staged run formatting on staged files at commit time (`npm run prepare` installs
the hooks — it runs automatically after `npm install`).

---

## 📦 Scripts

| Script            | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `npm run dev`     | Start the development server                                        |
| `npm run build`   | Production build                                                    |
| `npm run start`   | Serve the production build                                          |
| `npm run lint`    | Lint the codebase                                                   |
| `npm run format`  | Format `src/` with Prettier                                         |
| `npm run typegen` | Regenerate `src/types/supabase.ts` from the linked Supabase project |
