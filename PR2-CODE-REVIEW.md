# Code Review — PR #2: Auth Implementation

| | |
|---|---|
| **Pull request** | #2 — `feature/auth-implementation` → `main` |
| **Reviewed commit** | `cd13f05` (latest fetched from `origin`) |
| **Scope of diff** | 179 files changed, +14,544 / −349 |
| **Review date** | 2026-08-20 |
| **Verdict** | **Not production-ready as-is** — tenant-isolation and billing-webhook defects will bite in production |

**Method / caveat:** this is a manual read of the complete diff against `origin/main`. `tsc` and ESLint were **not** run — `node_modules` is absent in the review environment — so type and lint errors are not covered by this report.

---

## Summary by priority

| Priority | Count | Meaning |
|---|---|---|
| **P0 — Blockers** | 7 | Must be fixed before merge. Tenant isolation and billing correctness. |
| **P1 — High** | 5 | Silent data or payment loss; fix before production traffic. |
| **P2 — Medium** | 3 | Broken navigation / user dead ends. |
| **P3 — Cleanup** | 7 | Tidy-up before merge; not filed as defects. |

---

## P0 — Blockers (tenant isolation & billing correctness)

### 1. Org route never checks membership
**`src/app/[org]/layout.tsx:16`**

The `[org]` layout does not verify that the signed-in user is a member of the org in the URL. Any authenticated user can load `/any-slug` and receive the full application shell. `getAccount(org)` only proves that *a session exists*, not that the session belongs to that tenant.

**Fix:** resolve the membership row for `(user.id, slug)` in the layout and `notFound()` / `redirect()` when it is missing.

### 2. `getWorkspace` has no `user_id` filter
**`src/lib/dal.ts:90`**

`getWorkspace` selects the membership row without filtering on `user_id`. Because the RLS policy `view_org_members` deliberately exposes co-members' rows, `role` / `isAdmin` can be read off **another member's** row — a plain member can render as "owner".

**Fix:** add `.eq('user_id', user.id)` to the query.

### 3. Missing `!inner` on the organizations embed
**`src/lib/dal.ts:95`**

`.eq('organizations.slug', slug)` filters on an embedded resource without `organizations!inner(...)`. PostgREST only *nulls the embed* rather than dropping the row, so a user belonging to multiple orgs can resolve the **wrong org** or get `null`.

The same file already does this correctly with `projects!inner(...)` at line 192 — mirror that.

### 4. Side effects in a GET page component
**`src/app/(auth)/onboard/complete/page.tsx:26`**

A server page component sends invitation emails and creates Stripe Checkout sessions. Any refresh, back-navigation, or link prefetch re-runs both. Duplicate invites and duplicate Checkout sessions are reachable by a user pressing F5.

**Fix:** move the side effects into a server action / POST route (or make them idempotent behind a token).

### 5. `inviteTeam` trusts a client-supplied `orgId`
**`src/features/onboarding/actions.ts:98`**

The action accepts `orgId` from the client with no owner/admin authorization check. Only RLS stands behind it, which means the security boundary is one policy change away from being an open invite endpoint for arbitrary orgs.

**Fix:** verify the caller's role in `orgId` inside the action before doing any work.

### 6. Demo credentials are required in production
**`src/config/env.server.ts:7`**

`DEMO_ACCOUNT_EMAIL` / `DEMO_ACCOUNT_PASSWORD` are declared required and parsed at module load. A production deploy without demo credentials **throws at import of `admin.ts`** — a hard boot failure, not a degraded feature.

**Fix:** make them optional and gate the demo path on their presence.

### 7. Stripe webhook 500s on non-invoice sessions
**`supabase/functions/stripe-webhook/index.ts:93`**

`invoices.retrieve` runs *before* the `mode` check. A Checkout session with no invoice throws → the function returns 500 → the idempotency claim is released → Stripe retries forever on an event that can never succeed.

**Fix:** check `session.mode` (and `session.invoice != null`) before retrieving the invoice.

---

## P1 — High (silent data / payment loss)

### 8. Subscription update result never checked
**`supabase/functions/stripe-webhook/index.ts:248`**

`subId` is unvalidated, and the `update`'s error and affected-row count are never inspected. A paying customer can remain on the **Free** plan while the event is marked processed forever — no retry, no alert.

**Fix:** validate `subId`, check `error` and the returned rows, and fail the handler (so Stripe retries) when nothing was updated.

### 9. `create-invoice` builds URLs from the raw `Origin` header
**`supabase/functions/create-invoice/index.ts:149`**

`success_url` / `cancel_url` are built from the unvalidated `Origin` header, unlike `create-checkout` which uses an allowlist. Two consequences:
- Server-to-server calls (no `Origin`) produce literal `"null/dashboard/..."` URLs.
- The paths `/dashboard/invoices/...` **do not exist** in this app, which routes under `/[org]/...`.

**Fix:** reuse the `create-checkout` allowlist and correct the paths to the `/[org]/...` scheme.

### 10. Server-side `toast()` is a no-op; failures reported as success
**`src/app/auth/confirm/route.ts:29`, `src/features/auth/actions.ts:71`**

`sonner`'s `toast` is a browser API; calling it on the server does nothing. Worse, `sendPasswordReset` swallows the underlying failure and returns `ok: true` — the user is told an email is on its way when it is not.

**Fix:** return an error state to the client and render the toast there.

### 11. Invite metadata wiped even on failure
**`src/features/onboarding/actions.ts:211`**

`team_invites` metadata is cleared unconditionally, including when `inviteTeam` failed. The user-facing "you can retry from Settings" message is then unactionable — the pending invite list is already gone.

**Fix:** only clear metadata after a confirmed success.

### 12. Unauthenticated account-enumeration oracle
**`src/features/onboarding/actions.ts:42`**

`checkEmailAvailable` is unauthenticated and unthrottled, and is backed by the **service-role** admin API. It answers "does this email have an account?" for anyone who can reach the endpoint.

**Fix:** rate-limit it, and prefer a signup-time uniqueness error over a pre-flight oracle.

---

## P2 — Medium (broken navigation / dead ends)

### 13. Change-password Cancel lands in a fake workspace
**`src/features/auth/data.ts:40`** — Cancel links to `/profile`, which matches the `[org]` segment and drops the user into a non-existent workspace named "profile".

### 14. Redirect to a hardcoded, nonexistent org
**`src/app/page.tsx:12`** — users without a workspace are redirected to `/default-org`, which does not exist.

### 15. Activity feed always reads "Someone invited…"
**`src/features/onboarding/actions.ts:132`** — `getAccount(orgId)` is handed a **UUID** where a **slug** is expected, so the lookup always fails and every invite activity line falls back to "Someone".

---

## P3 — Cleanup before merge (not filed as defects)

- **Leftover debug logging** — `src/features/auth/actions.ts:56` (`console.log(membershipError, error)`), `src/app/[org]/profile/password/page.tsx:23`.
- **Accessibility** — `src/app/layout.tsx` viewport sets `maximumScale: 1, userScalable: false`, blocking pinch-zoom (WCAG 1.4.4 failure).
- **Dead code** — `src/components/shared/toaster.tsx` (themed, styled `Toaster`) is unused; `layout.tsx` imports the raw `Toaster` from `sonner`, losing the custom icons and theme.
- **Hardcoded values** — `foxy-hub-amber.vercel.app/` in the slug field (`onboard-wizard.tsx:302`); `WORKSPACE.org = 'Interloid Studio'` (`src/config/nav.ts:41`) is shown in every tenant's footer.
- **`getSlug()`** — `src/features/auth/actions.ts:135` does an unfiltered `.select('slug').single()`, which throws for any user in 2+ orgs. Currently unused: delete it.
- **Stray class** — `src/components/layout/app-shell.tsx:98` has a dangling `sm:` variant with no utility attached.
- **Seed data** — all seeded plans have `price_id = null`, so paid checkout returns "ready on the free plan" until the Stripe prices are created and backfilled.

---

## Recommended merge gate

1. Fix all **P0** items — these are tenant-isolation and billing-integrity defects, not polish.
2. Fix **P1** items 8 and 9 before any real payment traffic; 10–12 before general availability.
3. Run `tsc --noEmit` and ESLint locally (not covered by this review) and clear the **P3** list.
4. Add a regression test for cross-tenant access: sign in as a member of org A, request `/org-b`, assert 404.
