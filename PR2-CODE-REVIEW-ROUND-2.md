# Code Review — PR #2: Auth Implementation (Round 2)

| | |
|---|---|
| **Pull request** | #2 — `feature/auth-implementation` → `main` |
| **Reviewed commit** | `a0d63ae` (was `cd13f05` in round 1) |
| **New commits since round 1** | `831bfb9` fix pr blockers issue · `c671979` clean the code and check the lint · `a0d63ae` restrict subscription dialog to member |
| **Delta reviewed** | 39 files, +693 / −900 |
| **Full PR size** | 176 files, +14,338 / −350 vs `main` |
| **Review date** | 2026-08-21 |
| **Verdict** | **Still not production-ready.** 13 of 15 round‑1 findings are genuinely fixed — good work — but the cleanup commits **replaced the subscription-checkout edge function with a copy of the invoice one**, which breaks paid signup end to end. |

## Verification performed this round

Unlike round 1, dependencies were installed and the toolchain was run against `a0d63ae`:

| Check | Result |
|---|---|
| `tsc --noEmit` | **Pass** — no type errors |
| `eslint src` | **Pass** — no lint errors |
| `next build` (with env supplied) | **Pass** — 14 routes compiled |

The route list produced by the build is used below as ground truth for which URLs actually exist.

---

## 1. Round‑1 findings — status

### Fixed (13)

| # | Finding | Evidence at `a0d63ae` |
|---|---|---|
| 1 | Org route never checked membership | `src/app/[org]/layout.tsx:19` — `if (!account.isMember) redirect('/unauthorized?org=…')`, backed by a new `src/app/unauthorized/page.tsx` |
| 2 | `getWorkspace` had no `user_id` filter | `src/lib/dal.ts:94` — `.eq('user_id', session.id)` |
| 3 | Missing `!inner` on the organizations embed | `src/lib/dal.ts:93` — `organizations!inner(id, name, slug)` |
| 4 | Side effects in a GET page component | Page is now a thin server shell; work moved to `onboard-complete-client.tsx` calling the `startPlanCheckout` server action |
| 5 | `inviteTeam` trusted a client-supplied `orgId` | `src/features/onboarding/actions.ts:132-154` — membership + `owner`/`admin` role check |
| 6 | Demo credentials required in production | `src/config/env.server.ts:9-13` — now `.optional()`, gated by `isDemoModeEnabled()` |
| 7 | Webhook 500 on non-invoice sessions | `stripe-webhook/index.ts:76-84` — `mode === 'payment'` **and** `if (session.invoice)` guard both precede `invoices.retrieve` |
| 8 | Subscription update result never checked | `stripe-webhook/index.ts:212-248` — `orgId`/`subId` validated; `updateError` and zero-row updates both `throw` → 500 → claim released → Stripe retries |
| 9 | `create-invoice` built URLs from raw `Origin` | `create-invoice/index.ts:79-108` — `ALLOWED_ORIGINS` allowlist, `new URL()` parse, http(s) scheme check *(the URL **path** half of this finding is **not** fixed — see 3.2)* |
| 10 | Server-side `toast()`; reset reported as success | `sendPasswordReset` returns `{ ok: false, error }`; `auth/confirm/route.ts` redirects with an error param instead of toasting |
| 11 | Invite metadata wiped even on failure | `actions.ts:254` — `if (result.ok)` guards the `team_invites: null` write |
| 13 | Change-password Cancel went to `/profile` | `src/features/auth/data.ts:40` — `href: (org) => '/' + org + '/profile'` |
| 14 | Redirect to hardcoded `/default-org` | `src/app/page.tsx:11-15` — resolves the real slug, `/onboard` when there is none |
| 15 | `getAccount(orgId)` handed a UUID | `actions.ts:175` — `getAccount(membership.organization.slug)` |

Round‑1 P3 items also cleared: debug `console.log` removed from `auth/actions.ts` and `profile/password/page.tsx`; `getSlug()` deleted; the themed `Toaster` is now the one `layout.tsx` imports; the dangling `sm:` in `app-shell.tsx` became `shell:px-8`; the hardcoded Vercel host is gone from the wizard; `nav.ts` footer uses the real org name; seeded plans now carry real `price_id` values.

### Partially fixed (1)

| # | Finding | Where it stands |
|---|---|---|
| 12 | Account-enumeration oracle on `checkEmailAvailable` | Now rate-limited (`actions.ts:57`, 5/min per IP). But `src/lib/rate-limit.ts` is a **module-level `Map`** — see 3.5. |

### Not fixed (1)

| # | Finding | Where it stands |
|---|---|---|
| P3 | `src/app/layout.tsx:24-25` still sets `maximumScale: 1, userScalable: false` | Pinch-zoom is still blocked — WCAG 2.1 SC 1.4.4 failure. Delete both lines. |

---

## 2. P0 — New blocker introduced by the fix commits

### 2.1 `create-checkout` was overwritten with a copy of `create-invoice`; paid signup is dead
**`supabase/functions/create-checkout/index.ts` (whole file), `src/features/onboarding/services/billing.ts:36`**

`create-checkout` used to be the **subscription** checkout: it took `{ planId, orgId, returnUrl }`, looked up the org's `subscriptions` row, and wrote `metadata: { orgId, subId }` onto the Stripe session. At `a0d63ae` it is a near-verbatim duplicate of `create-invoice` — it takes `{ invoiceId }`, `mode: 'payment'`, and `metadata: { invoice_id }`.

The caller was not changed:

```ts
// src/features/onboarding/services/billing.ts:36
const { data, error } = await supabase.functions.invoke('create-checkout', {
  body: { planId: plan.id, orgId: params.orgId, returnUrl: params.returnUrl },
})
```

The function's first validation is:

```ts
// create-checkout/index.ts:70
if (typeof invoiceId !== 'string' || !invoiceId) {
  return json({ success: false, error: 'invoiceId is required' }, 400)
}
```

**Every paid plan checkout now fails with HTTP 400.** The user reaches `/onboard/complete`, `startPlanCheckout` throws, and the screen reads "Could not start payment checkout."

Three further consequences chain off this:

1. **The webhook can never activate a subscription.** `stripe-webhook/index.ts:208-216` reads `session.metadata.orgId` and `session.metadata.subId`. Nothing sets them any more — the only code that did was deleted. Even if checkout were reachable, the handler would throw on missing metadata.
2. **Pending team invites are now unreachable.** `PaymentSuccessCard` (which calls `redeemPendingInvites`) renders only on `/[org]` when `?payment=success` is present. The old `success_url` was `${base}/${org}?payment=success&session_id=…`; the new one is `${base}/${org}/invoices/${id}?payment=success`, which is a 404 (see 3.2). Invites stored in `team_invites` metadata would never be redeemed and there is no other path that redeems them.
3. **Cancel goes nowhere.** The old `cancel_url` was `${base}/${org}/billing/canceled` — a route that exists and is now orphaned.

**Fix:** restore the subscription `create-checkout` from `cd13f05` (`git show cd13f05:supabase/functions/create-checkout/index.ts`), keeping the round‑1 origin-allowlist hardening that was correctly applied to `create-invoice`. Invoice payment already has its own, better-guarded function — the two should not have been merged.

### 2.2 The duplicate is a strictly weaker copy — an already-paid invoice can be charged again
**`supabase/functions/create-checkout/index.ts:106-140`**

Comparing the two files line for line, `create-checkout` is missing every guard `create-invoice` has:

| Guard | `create-invoice` | `create-checkout` |
|---|---|---|
| Only `due`/`overdue` invoices are payable | ✅ line 126 → 409 | ❌ absent — a `paid` invoice yields a live Checkout session |
| Amount is finite and positive | ✅ line 134 → 409 | ❌ `Math.round(Number(invoice.amount) * 100)` can be `NaN` or `≤ 0` |
| `customer_email` only when the caller is the invoice's client | ✅ line 140 | ❌ line 136 sets `customer_email: user.email` unconditionally |
| Column projection | ✅ named columns | ❌ `select('*')` |

If `create-checkout` is ever pointed at invoices, this is a double-charge path. If it is restored to subscription duty per 2.1 the table is moot — but do not ship the duplicate as-is either way.

---

## 3. P1 — High

### 3.1 `startPlanCheckout` has no role check, and `findOwnedOrgId` is not filtered by user
**`src/features/onboarding/actions.ts:202-233`, `src/features/onboarding/services/invitations.ts:75-85`**

`inviteTeam` got a proper owner/admin check this round. `startPlanCheckout` did not — it accepts any signed-in user and resolves the org through:

```ts
// invitations.ts:78
const { data } = await supabase.from('memberships')
  .select('org_id').eq('role', 'owner').limit(1).maybeSingle()
```

There is no `user_id` filter. The `view_org_members` RLS policy (`supabase/schemas/policies/02_rls_memberships.sql:10-12`) deliberately exposes co-members' rows, so this returns the **owner's** row of an org the caller merely belongs to. A plain member can therefore start a plan checkout and change their org's billing. Commit `a0d63ae` restricted the subscription dialog in the UI (`set-password-form.tsx:44`) — the server action behind it is still open.

Second defect in the same function: for a user in more than one org, `.limit(1)` with no `order by` picks an arbitrary org — the wrong workspace can be billed.

**Fix:** filter by `user_id`, require `role in ('owner','admin')` inside `startPlanCheckout`, and take the target org from the caller's session context rather than a "first owner row" lookup.

### 3.2 Stripe return URLs point at routes that do not exist
**`create-invoice/index.ts:168-169`, `create-checkout/index.ts:137-138`**

Both functions return the user to:

```
${base}/${orgSlug}/invoices/${invoice.id}?payment=success
```

The org prefix was the fix applied for round‑1 finding 9, and it is correct. But `next build` at `a0d63ae` emits exactly these routes:

```
/  ·  /[org]  ·  /[org]/billing/canceled  ·  /[org]/profile  ·  /[org]/profile/password
/auth/callback  ·  /auth/confirm  ·  /forgot-password  ·  /onboard  ·  /onboard/complete
/set-password  ·  /sign-in  ·  /unauthorized
```

There is **no `/[org]/invoices/[id]`**. Every successful payment lands the customer on a 404 immediately after being charged.

**Fix:** point at a route that exists (`/${orgSlug}?payment=success&session_id={CHECKOUT_SESSION_ID}` restores the working behaviour and re-enables `PaymentSuccessCard`), or build the invoice detail route before shipping.

### 3.3 Webhook: plan lookup failure silently consumes the event
**`supabase/functions/stripe-webhook/index.ts:160-171`**

```ts
if (planError || !plan) {
  console.error(`Invalid Plan: Could not find internal plan for Price ID: ${stripePriceId}`)
  break        // ← falls through to a 200
}
```

The event was already claimed in `stripe_events` at line 54. `break` returns 200, so Stripe never retries and the row stays claimed forever. The customer has paid; the `subscriptions` row is never updated. This is the exact failure mode that round‑1 finding 8 called out, surviving on the adjacent branch.

Because a Stripe price ID that is missing from `plans` is precisely what happens after any price is rotated in the Stripe dashboard, this is a live path, not a theoretical one.

**Fix:** `throw` here, as the code correctly does for missing metadata at line 213 — that releases the claim and lets Stripe retry while you backfill the plan row.

### 3.4 Webhook: invoice-paid update never checks its error, then logs success
**`supabase/functions/stripe-webhook/index.ts:89-101`**

```ts
const { data: paidInvoice } = await supabase.from('invoices').update({ status: 'paid', … })
  .eq('id', invoiceId).select(…).maybeSingle()

console.log(`Invoice ${invoiceId} marked as paid.`)   // unconditional
```

The `error` field is discarded. If the update fails or matches no row, the handler logs success, returns 200, and the event is consumed — a paid invoice stays `due` with nothing to alert on. Same class as 3.3 and as round‑1 finding 8, on the `payment` branch.

**Fix:** destructure `error`, and throw when `error` is set or `paidInvoice` is null with a non-null `invoiceId`.

### 3.5 The rate limiter does not survive the runtime it runs on
**`src/lib/rate-limit.ts`**

```ts
const tracker = new Map<string, { count: number; resetTime: number }>()
```

Two problems on a serverless deployment:
- **Per-instance state.** Each lambda/edge instance keeps its own `Map`, and instances are created and recycled per traffic. The effective limit is 5/min *per instance*, and an attacker fanning out across cold starts sees no limit at all. The round‑1 enumeration oracle (finding 12) is slowed, not closed.
- **Unbounded growth.** Entries are only ever overwritten on a later hit for the same key; expired entries are never evicted. A spray of distinct IPs grows the map until the instance is recycled.

**Fix:** back it with Postgres or a shared store (Upstash/Redis), or move the check into Supabase where the request already terminates.

### 3.6 `setPassword` can report failure after the password was already changed
**`src/features/auth/actions.ts:132-140`** *(introduced in `a0d63ae`)*

```ts
const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } })
if (error) return { ok: false, error: error.message }

const { data: membership, error: membershipError } = await supabase
  .from('memberships').select('role').eq('user_id', user.id).single()
if (membershipError) return { ok: false, error: membershipError.message }
```

`.single()` throws `PGRST116` unless there is **exactly one** membership row. A user invited into a second org has two rows; a user whose membership has not been created yet has zero. Either way the action returns `ok: false` with a raw PostgREST message — *after the password has already been set*. The user is told it failed, retries, and the form rejects them because the old password no longer applies.

This is the same `.single()` defect as the round‑1 `getSlug()` item, reintroduced on a critical path.

**Fix:** use `.limit(1).maybeSingle()` (or scope the query to the org the invite belongs to) and never fail the action on a post-success lookup — default the role and continue.

---

## 4. P2 — Medium

### 4.1 Sign-in page reflects an unvalidated message from the query string
**`src/app/(auth)/sign-in/page.tsx:26-28`**

```ts
const initialError = error_description ?? (error ? (ERRORS[error] ?? ERRORS.invalid_link) : undefined)
```

`error_description` is rendered verbatim. React escapes it, so this is not XSS — but anyone can send `/sign-in?error_description=Your+account+is+locked.+Call+1-800-…` and the app will display it as its own error copy on its own domain. It also surfaces raw Supabase internals to end users.

**Fix:** keep the `ERRORS` lookup as the only source of user-facing copy; log `error_description` server-side instead of rendering it.

### 4.2 Subscription updates match on customer, not subscription
**`supabase/functions/stripe-webhook/index.ts:287`**

```ts
.eq('stripe_customer_id', sub.customer)
```

Two issues: a customer with more than one subscription has every row overwritten by whichever event arrives, and because `stripe_customer_id` is only written by `checkout.session.completed`, a `customer.subscription.updated` that arrives first (Stripe does not guarantee ordering) matches nothing — line 292 logs a warning and returns 200, consuming the event.

**Fix:** match on `stripe_subscription_id`, and treat "no row matched" as retryable rather than a warning.

### 4.3 Invite delivery depends on the browser coming back, and fails silently
**`src/components/billing/payment-success-card.tsx:36-47`**

Invites are redeemed only when the user's browser lands on `?payment=success`. If they close the tab after paying, the invites sit in `team_invites` metadata with no other trigger and no retry surface (there is no settings route in the build output). And when `redeemPendingInvites` returns `ok: false`, the `if (invites.ok)` branch is skipped and **nothing is shown at all** — the spinner just stops.

**Fix:** move redemption server-side (webhook or a first-login hook), and render `invites.error` in the `else` branch.

### 4.4 Multi-org users get a non-deterministic workspace
**`src/lib/dal.ts:100`, `src/features/auth/actions.ts:43`, `src/features/onboarding/services/invitations.ts:82`**

Three separate `.limit(1)` queries with no `order by` decide which org a user lands in, signs into, and is billed for. Postgres makes no ordering guarantee, so the same user can be routed to different orgs on different requests.

**Fix:** order explicitly (e.g. by `created_at`) or persist a "last active org" and honour it.

### 4.5 `NEXT_PUBLIC_TWITTER_HANDLE` is a hard boot requirement
**`src/config/env.ts:11-13`**

Verified by build: with every other variable supplied, `next build` fails with `Invalid input: expected string, received undefined` for `NEXT_PUBLIC_TWITTER_HANDLE`. A purely cosmetic Open Graph field takes the whole app down when unset. This is the same defect class as round‑1 finding 6 (demo credentials), which was fixed in `env.server.ts` but not here.

**Fix:** `.optional()`, and omit the Twitter card when it is absent.

### 4.6 `account.initials` is computed from the org slug
**`src/lib/dal.ts:138-141`**

```ts
initials: initialsOf((workspace?.slug as string | null) ?? null, session.email)
```

`initialsOf(name, email)` expects the person's name; it is being handed the workspace slug, so `AccountDTO.initials` is the org's initials, not the user's. The layout still passes it down as `account.initials`. Commit `a0d63ae` worked around this by having each component call `initialsOf(account.name, account.email)` directly — which is correct, and leaves the DTO field both wrong and unused.

**Fix:** pass `fullName`, or drop the field from the DTO.

---

## 5. P3 — Cleanup before merge

- **New debug log in a hot path** — `src/lib/initials.ts:8` has `console.log(source)`. `initialsOf` runs on every authenticated render. Introduced in `a0d63ae`; delete it.
- **Viewport still blocks zoom** — `src/app/layout.tsx:24-25` (carried over from round 1, unfixed).
- **Stripe price IDs hardcoded in a migration** — `supabase/migrations/20260729102721_seed_plans.sql:22+` embeds literal `price_1U1nt0…` IDs. These are account- and mode-specific; a different Stripe account or a test/live switch silently breaks checkout at the plan lookup (see 3.3). Prefer seeding them from environment config or a backfill step.
- **Five migrations deleted in `831bfb9`** — `update_delivery_status`, `update_subscription`, `cron_overdue_timeout`, `deliverables_client_scope`, `subscription_status_stripe_values`, `reseed_design_plans`. Safe against `main` (which has no migrations at all), but any Supabase project that already ran them is now drifted from the repo and `supabase db push` will not reconcile it. Confirm no shared dev/staging project has applied them.
- **`sendPasswordReset` returns raw Supabase errors** — `src/features/auth/actions.ts:70` surfaces `error.message` directly to the client; map to fixed copy for consistency with the rest of the file.
- **`changePassword` re-authenticates via `signInWithPassword`** — `actions.ts:166` rotates the session as a side effect of verifying the current password. It works, but `updateUser` with a re-auth nonce is the intended flow.
- **`create-invoice` is now unreachable from the app** — nothing in `src/` invokes it (only `create-checkout` is invoked, from `billing.ts:36`). Once 2.1 is resolved, wire the invoice UI to it or the better-guarded function stays dead code.

---

## 6. Merge gate

1. **Restore `create-checkout`** as the subscription function (2.1) and re-test the full paid signup: onboard → checkout → webhook → subscription row active → invites redeemed.
2. Fix the return URLs (3.2) so the post-payment landing page exists.
3. Make every webhook failure path throw rather than `break`/warn (3.3, 3.4, 4.2) — a consumed event is an unrecoverable payment discrepancy.
4. Add the server-side authorization check to `startPlanCheckout` (3.1).
5. Fix `setPassword` (3.6) before inviting anyone into a second org.
6. Replace the in-memory rate limiter (3.5) or accept that finding 12 remains open.
7. Clear the P3 list, re-run `tsc`, `eslint`, and `next build` — all three pass at `a0d63ae` and should stay passing.
8. Add the regression tests this round would have caught: cross-tenant `/org-b` access returns 403/404; `create-checkout` accepts a `planId` payload; a webhook event with an unknown `price_id` is retried, not consumed.
