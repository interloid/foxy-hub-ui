# Code Review Report
- **Date:** 2026-09-24
- **Reviewer:** Claude Code (automated review)
- **Scope:** `src/app/[org]/settings`, `src/app/[org]/people`, `src/features/settings`, `src/features/people`, and the shared code they depend on (`src/lib/{dal,format,locale,time-zone,inactivity,mfa,role,digest-token,rate-limit}.ts`, `src/context/locale-provider.tsx`, `src/components/common/*-sync.tsx`, `src/components/common/inactivity-watcher.tsx`, `src/features/auth/mfa-actions.ts`, `src/features/onboarding/{actions,services/invitations}.ts`, `src/app/api/digest/unsubscribe/route.ts`, `src/proxy.ts`, and the SQL functions/policies they call) · 55 files
- **Verdict:** CRITICAL
---

## ⚡ 1. High-Risk Issues (Bugs, Security Leaks, Broken Logic)

* **RISK-001** · `src/lib/mfa.ts:21-23` (same check in `src/app/auth/confirm/route.ts:10`, `src/app/auth/callback/route.ts:12`, `src/app/(auth)/set-password/page.tsx:25`)
* **What is wrong:** The "safe `next` path" check only rejects values that start with `//`. A value like `/\evil.com` passes. Browsers and `new URL()` treat `\` as `/`, so it resolves to `https://evil.com/`.
* **Why it matters:** This is an open redirect: a link on your domain can send people to a phishing site. For example, `/sign-in/verify?next=/%5Cevil.com` is followed by `proxy.ts` for any signed-in user without 2FA. The same trick works on the email-confirm, callback and set-password redirects.
* **Recommendation:** Reject backslashes and control characters, and share one helper across all four places.
* **Minimal fix:**
```ts
export function safeNextPath(next: string | null | undefined): string {
  return next &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !/[\\\x00-\x1f]/.test(next)
    ? next
    : '/'
}
```

* **RISK-002** · `supabase/schemas/policies/02_rls_memberships.sql:34-43` and `supabase/schemas/functions/functions.sql` (`update_membership_details`)
* **What is wrong:** The membership update policy allows **managers** to update any membership that is not, and does not become, `primary_admin`. The `update_membership_details` function also lets managers set any role. Nothing compares the new role with the caller's own role. The app's `updateMemberAction` blocks managers, but that is only the app. The database is reachable directly with the public anon key and the user's login.
* **Why it matters:** A manager can make themselves `admin` with one API call. They can also set `status = false` on other members, which skips the "only the primary admin deactivates" rule. The invitations policy (`15_rls_invitations.sql`) is a second route to the same result: managers can insert invitations with `role = 'admin'`. This is live on the cloud project.
* **Recommendation:** Only primary admins and admins may change `role` or `status`, and nobody may grant a role above their own. Enforce this in the policy and in the function.
* **Minimal fix:**
```sql
-- update_membership_details, after the existing has_org_role check
if new_role is distinct from v_role
   and not public.has_org_role(v_org_id, array['primary_admin','admin']::public.user_role[]) then
  raise exception 'Only an admin can change roles' using errcode = '42501';
end if;
-- 02_rls_memberships.sql: drop 'manager' from owners_admins_update_member_role
--   (or add a BEFORE UPDATE trigger that blocks role/status changes by managers)
-- 15_rls_invitations.sql: allow managers to invite only 'contributor'
```

* **RISK-003** · `src/app/[org]/people/page.tsx:26-34`
* **What is wrong:** The page has no role check. Contributors are kept out only by hiding the nav link (`src/config/nav.ts`). The page's data (`src/features/people/queries.ts:331-362`) reads every member's email and last sign-in with the **service-role** client, which skips row security.
* **Why it matters:** A contributor who types `/{org}/people` sees the whole team roster, with emails and last sign-in times, and the client contact list.
* **Recommendation:** Check the role on the server before loading the data.
* **Minimal fix:**
```tsx
const workspace = await getWorkspace(org)
if (!workspace || !['primary_admin', 'admin', 'manager'].includes(workspace.role)) notFound()
```

* **RISK-004** · `src/features/onboarding/actions.ts:126-208`
* **What is wrong:** `inviteTeam` is exported from a `'use server'` file, so it is a public endpoint. It takes a raw `orgId` and an `invites[]` array. It has no input validation (email, role, `projectId`) and no seat-limit check.
* **Why it matters:** `inviteMemberAction` checks seats, but any admin can call `inviteTeam` directly. They can send 50 invites and go past the plan's member limit.
* **Recommendation:** Move `inviteTeam` into a `server-only` module that is not a server action, or add schema validation and the seat check inside it.
* **Minimal fix:**
```ts
// features/onboarding/services/invite-team.ts
import 'server-only'
export async function inviteTeam(/* same signature */) { /* same body */ }
```

* **RISK-005** · `src/features/people/components/members-clients-view.tsx:144`, `src/features/people/components/edit-member-sheet.tsx:82-86` vs `src/features/people/actions.ts:513-518`
* **What is wrong:** The UI shows **Deactivate** to admins (`isAdminRole(viewerRole)`). The server action allows only the primary admin.
* **Why it matters:** Every admin who clicks Deactivate gets the error "Only the workspace primary admin can deactivate people." The button looks broken.
* **Recommendation:** Make the UI rule match the server rule. Or, if admins should be able to deactivate, change the server rule.
* **Minimal fix:**
```tsx
const canDeactivate = viewerRole === 'primary_admin'
```

* **RISK-006** · `src/features/people/queries.ts:134` → `edit-member-sheet.tsx:70,126-130` → `update_membership_details`
* **What is wrong:** A member with no name is shown as `'Unnamed teammate'`. That placeholder becomes the form's starting value and is always sent on save. The function then writes it to `profiles.full_name`.
* **Why it matters:** Changing only someone's role permanently renames them "Unnamed teammate". Profiles are shared, so the wrong name shows in every workspace they belong to.
* **Recommendation:** Keep the placeholder in the UI only, and send the name only when it changed.
* **Minimal fix:**
```ts
// queries.ts
fullName: profileMap.get(membership.user_id) ?? null
// edit-member-sheet.tsx — render `member.fullName ?? 'Unnamed teammate'`, and on save:
fullName: fullName.trim() === (member.fullName ?? '') ? '' : fullName
```

## ⚠️ 2. Medium-Risk Issues (Performance, Anti-patterns, Next.js Violations)

* **RISK-007** · `src/features/settings/actions.ts:71-79` (`updateWorkingDayAction`), `:96-103` (`renameWorkspaceAction`)
* **What is wrong:** The input shape is never checked. The code calls `input.currency.trim()` and `name.trim()` directly.
* **Why it matters:** A request with `null` or a number throws, so the caller gets a 500 error instead of `{ ok: false }`. Permissions are safe, because the SQL function checks the role.
* **Recommendation:** Parse the input with zod before using it.
* **Minimal fix:**
```ts
const parsed = z.object({
  dailyCapacityHours: z.number().int().min(1).max(24),
  daysPerWeek: z.number().int().min(1).max(7),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  roundingMinutes: z.number().int().min(1).max(60),
}).safeParse(input)
if (!parsed.success) return { ok: false, error: 'Check the values and try again.' }
```

* **RISK-008** · `src/app/api/digest/unsubscribe/route.ts:58-70`
* **What is wrong:** The `GET` handler unsubscribes the user immediately.
* **Why it matters:** Email security scanners and link preview tools open links on their own. Users get unsubscribed without clicking anything.
* **Recommendation:** Make `GET` show a page with a confirm button (`<form method="post">`), and only unsubscribe in `POST`.
* **Minimal fix:**
```ts
export async function GET() {
  return page('Unsubscribe from the weekly digest?', '<form method="post"><button>Unsubscribe</button></form>', 200)
}
```

* **RISK-009** · `src/context/locale-provider.tsx:36-41`, fed from `src/app/[org]/layout.tsx:39`
* **What is wrong:** In automatic time-zone mode the provider gets `timeZone = null`. `useFormatter()` then uses the runtime's zone: UTC on the server, the device's zone in the browser.
* **Why it matters:** A client component that formats a timestamp can render one time on the server and a different one in the browser. React then reports a hydration mismatch — the server HTML and the first browser render disagree. The Security tab avoids this; `studio-plan-card.tsx` does not.
* **Recommendation:** Pass the zone the server already resolved.
* **Minimal fix:**
```tsx
<LocaleProvider locale={account.locale} timeZone={await getUserTimeZone()}>
```

* **RISK-010** · `src/features/settings/actions.ts:266-269` (`sendTestDigest`)
* **What is wrong:** The rate-limit call (Upstash Redis) is awaited outside the `try` block.
* **Why it matters:** If Redis fails, the action throws. The whole Settings page is replaced by the error screen instead of showing a toast.
* **Recommendation:** Move the `rateLimit` call inside the existing `try`.
* **Minimal fix:**
```ts
try {
  const allowed = await rateLimit(`digest-test:${user.id}`, { limit: 3, windowMs: 600_000 })
  if (!allowed) return { ok: false, error: 'Test sent recently. Try again in a few minutes.' }
  // …existing fetch…
} catch { return { ok: false, error: 'Could not send the test digest.' } }
```

* **RISK-011** · `src/features/settings/components/security-tab.tsx:46,184`
* **What is wrong:** `'Last changed 3 months ago'` is hard-coded and shown to every user.
* **Why it matters:** A security screen tells people something untrue about their password.
* **Recommendation:** Remove the hint until there is a real "password changed" date.
* **Minimal fix:**
```tsx
<Row label="Password">
```

* **RISK-012** · `src/features/people/actions.ts:88,185,290,348,389,426,471,496,542,641`
* **What is wrong:** All 10 actions call `revalidatePath('/${orgSlug}/members-clients')`. That route does not exist; the page is `/{org}/people`.
* **Why it matters:** The page refreshes today only because Next 16.3 currently ignores the path (`revalidate.js`: "TODO: only revalidate if the path matches"). When Next starts matching paths, the People page will keep showing old data after every change.
* **Recommendation:** Use the real path in one shared constant. Role changes and ownership transfers also affect the sidebar, so use the layout scope for those.
* **Minimal fix:**
```ts
const peoplePath = (slug: string) => `/${slug}/people`
revalidatePath(peoplePath(orgSlug))
```

* **RISK-013** · `src/features/people/actions.ts:433,466-469,494`
* **What is wrong:** `updateMemberAction` accepts any `role`, including `client`, without checking it. Raw database error messages are sent to the toast.
* **Why it matters:** An admin can turn a staff member into a portal-only client by mistake. They can also promote a client membership to admin, which skips the seat limit. Users see messages like "invalid input syntax for type uuid".
* **Recommendation:** Allow only staff roles, and map database errors to fixed messages.
* **Minimal fix:**
```ts
const role = z.enum(['admin', 'manager', 'contributor']).safeParse(input.role)
if (!role.success) return { ok: false, error: 'Choose a role.' }
```

* **RISK-014** · `src/features/people/actions.ts:606-635` (`resetMemberMfaAction`)
* **What is wrong:** 2FA belongs to the person's whole account, not to one workspace. An admin of workspace A can remove 2FA from someone who is primary admin of workspace B. The primary-admin check only looks at workspace A.
* **Why it matters:** One workspace's admin can weaken sign-in protection for another workspace.
* **Recommendation:** Refuse the reset if the target is primary admin or admin in any other workspace.
* **Minimal fix:**
```ts
const { count } = await admin.from('memberships').select('id', { count: 'exact', head: true })
  .eq('user_id', membership.user_id).neq('org_id', workspace.id).in('role', ['primary_admin', 'admin'])
if (count) return { ok: false, error: 'They are an admin in another workspace. Ask Foxy HUB support.' }
```

* **RISK-015** · `src/features/people/queries.ts:187,219-220` vs `:291-318`
* **What is wrong:** The seat card counts all members, including deactivated ones, against `plans.seats`. The real check counts active members plus pending staff invites against `plans.features.max_members`. `pendingInvites` also counts client invites.
* **Why it matters:** The card can say "3 of 5" while an invite is rejected as full, or "5 of 5" while it succeeds.
* **Recommendation:** Use `getSeatUsage()` for both numbers, and count only staff invites.
* **Minimal fix:**
```ts
const seats = await getSeatUsage(workspace.id)
// seatsUsed: seats.used, seatsTotal: seats.maxMembers
```

* **RISK-016** · `src/features/people/actions.ts:59`
* **What is wrong:** Re-inviting someone who already has a pending invite still counts as a new seat. The service then replaces the old invite anyway.
* **Why it matters:** "Resend invite" fails exactly when the workspace is full.
* **Recommendation:** Skip the seat check when that email already has a pending invite in this workspace.
* **Minimal fix:**
```ts
if (!hasPendingInviteFor(email) && seats.used >= seats.maxMembers) return { ok: false, error: '…' }
```

* **RISK-017** · `src/features/people/actions.ts:54-86`, `:131-172`
* **What is wrong:** The seat and client limits are read first and written separately.
* **Why it matters:** Two admins inviting at the same moment can both take the last seat.
* **Recommendation:** Enforce the limit in the database, with a trigger or function on insert.
* **Minimal fix:**
```sql
-- BEFORE INSERT trigger on invitations/clients that counts and raises when over the plan limit
```

* **RISK-018** · `src/features/people/actions.ts:188,192-196` (`createClientAction`)
* **What is wrong:** It sends a portal invite when `invite` is true, even if `portal` is off. It also reads raw `input.*` values after validating `parsed.data`.
* **Why it matters:** A client with portal access turned off can still receive a portal invitation. Only the client-side form prevents it.
* **Recommendation:** Check `portal` on the server and use the validated values.
* **Minimal fix:**
```ts
if (!parsed.data.invite || !parsed.data.portal || !email) return { ok: true }
```

* **RISK-019** · `src/features/people/components/edit-member-sheet.tsx:54-59,107-110`, `edit-client-sheet.tsx:47-50,77-80`
* **What is wrong:** The edit form stays mounted while the sheet is closed. "Discard changes" only closes it.
* **Why it matters:** Reopening the same person shows the edits you discarded, and the form already counts as changed.
* **Recommendation:** Mount the form only while the sheet is open.
* **Minimal fix:**
```tsx
{open && <EditMemberSheetForm key={member.membershipId} member={member} {...props} />}
```

* **RISK-020** · `edit-member-sheet.tsx:125-131,145-147`, `edit-client-sheet.tsx:95-101,113-116`, `invite-member-sheet.tsx:127-134`, `new-client-sheet.tsx:130-139`
* **What is wrong:** `setIsSaving(true)` has no matching `finally`. If the action throws, for example on a network error, the flag stays on.
* **Why it matters:** The Save or Invite button stays disabled until the page is reloaded.
* **Recommendation:** Reset the flag in `finally`.
* **Minimal fix:**
```ts
setIsSaving(true)
try { /* await action */ } finally { setIsSaving(false) }
```

* **RISK-021** · `supabase/schemas/functions/functions.sql` (`check_email_exists`, granted to `anon`)
* **What is wrong:** Anyone with the public anon key can call `check_email_exists` directly, with no limit. The app's rate limit only covers its own action.
* **Why it matters:** An attacker can test unlimited email addresses to find who has an account.
* **Recommendation:** Revoke it from `anon` and `authenticated`. The app already calls it through the admin client.
* **Minimal fix:**
```sql
revoke execute on function public.check_email_exists(text) from public, anon, authenticated;
```

* **RISK-022** · `src/features/people/actions.ts` (no reactivate path) and `:72-77`
* **What is wrong:** Nothing sets `memberships.status` back to `true`. Re-inviting a deactivated member fails because their email already has an account.
* **Why it matters:** A member deactivated by mistake cannot be brought back from the app.
* **Recommendation:** Add a "Reactivate" action and button for the primary admin that checks the seat limit.
* **Minimal fix:**
```ts
await supabase.from('memberships').update({ status: true }).eq('id', membershipId).eq('org_id', workspace.id)
```

* **RISK-023** · `src/features/people/queries.ts:168,191-212,349-351`
* **What is wrong:** The page makes one admin `getUserById` call per member and one per client user on every load. The client results feed `inviteStatus`, which nothing shows. `projectOptions` is only used by commented-out JSX.
* **Why it matters:** The People page gets slower with each person added, for data that is thrown away.
* **Recommendation:** Delete the unused work, and fetch member emails in one call.
* **Minimal fix:**
```ts
const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
```

* **RISK-024** · `src/features/people/queries.ts:99-231`
* **What is wrong:** None of the 7 queries checks `.error`.
* **Why it matters:** A database or network failure shows "Nobody here yet." instead of the error screen, so admins think their team is gone.
* **Recommendation:** Throw on errors in the queries the page depends on.
* **Minimal fix:**
```ts
if (membershipsRes.error) throw membershipsRes.error
```

* **RISK-025** · `src/features/people/actions.ts:464-465`
* **What is wrong:** `fullName.data as unknown as string` hides a real `null` (the schema turns `''` into `null`).
* **Why it matters:** TypeScript says a string is sent while `null` is sent. It works only because the SQL happens to handle `null`. A future change will break silently.
* **Recommendation:** Make the function arguments nullable in SQL, regenerate types, and drop the casts.
* **Minimal fix:**
```sql
-- update_membership_details(..., new_full_name text default null, new_job_title text default null, ...)
```

* **RISK-026** · `src/features/settings/components/security-tab.tsx:57-82` (`describeActivity`)
* **What is wrong:** "Today"/"Yesterday" is worked out in the device's zone, but the time is printed in the user's manual zone.
* **Why it matters:** A device can be labelled "Today" with a time from a different day.
* **Recommendation:** Compare days with the same formatter that prints the time.
* **Minimal fix:**
```ts
const isToday = fmt.date(seen, 'date') === fmt.date(now, 'date')
```

* **RISK-027** · `src/features/settings/components/security-tab.tsx:114`
* **What is wrong:** The inactivity setting is copied into state once and never updated from props. The other settings rows do update.
* **Why it matters:** After the value changes elsewhere (another tab, a refresh after a failed save), the dropdown shows the old value.
* **Recommendation:** Use the same "update state when the prop changes" pattern as the other rows.
* **Minimal fix:**
```ts
const [serverValue, setServerValue] = useState(inactivityTimeout)
if (inactivityTimeout !== serverValue) { setServerValue(inactivityTimeout); setInactivity(inactivityTimeout) }
```

* **RISK-028** · `src/components/common/inactivity-watcher.tsx:74-81`
* **What is wrong:** If `signOutInactive()` fails, `signingOut` stays `true` and the redirect never happens.
* **Why it matters:** An idle tab on a shared machine stays open. The server still blocks the next request.
* **Recommendation:** Redirect whether or not the sign-out call succeeds.
* **Minimal fix:**
```ts
try { await signOutInactive() } finally { notifyOtherTabsOnLogout(); window.location.href = '/sign-in?error=session_expired' }
```

* **RISK-029** · `src/features/people/components/new-client-sheet.tsx:64,87,155`
* **What is wrong:** `invite` starts as `true` and counts towards "changed", so closing an untouched form asks "Discard this client?". The success toast says "send one from their profile", but the client sheet has no invite button.
* **Why it matters:** Users get a pointless warning, then a hint to use a feature that is not there.
* **Recommendation:** Start `invite` as `false`, or leave it out of `isDirty`. Change the toast or add the invite button (see RISK-036).
* **Minimal fix:**
```ts
const [invite, setInvite] = useState(false)
```

* **RISK-030** · `src/features/people/actions.ts:244,305,363,403,441` vs `supabase/schemas/policies/16_rls_clients.sql:104-111`
* **What is wrong:** The error messages say managers can edit people and clients, but the actions refuse managers. The client table policy does let managers write directly.
* **Why it matters:** The app and the database disagree about what managers may do, and the messages match neither.
* **Recommendation:** Decide the manager rule once, and apply it to the messages, the actions and the policy.
* **Minimal fix:**
```ts
error: 'Only a primary admin or admin can edit clients.'
```

## 🏗️ 3. Architectural & Cross-File Findings

* **RISK-031** · Affected files: `src/lib/mfa.ts`, `src/app/auth/confirm/route.ts`, `src/app/auth/callback/route.ts`, `src/app/(auth)/set-password/page.tsx`
* **What is wrong:** The same "safe redirect path" check is written four times.
* **Why it matters:** All four copies share the bug in RISK-001. A fix in one file leaves the other three open.
* **Recommendation:** Keep one `safeNextPath` in `src/lib`, and import it everywhere.

* **RISK-032** · Affected files: `src/features/settings/components/workspace-tab.tsx:52,107,141,154,165,197,231`, `src/features/settings/queries.ts:50`
* **What is wrong:** The tab hard-codes `ROLE = ['admin', 'primary_admin']` and repeats the check six times. It ignores `settings.canEdit`, which the query already computes.
* **Why it matters:** There are two sources of truth for who can edit, and they will drift. The SQL still enforces the rule, so this is not a security hole.
* **Recommendation:** Use `settings.canEdit` everywhere in the tab.

* **RISK-033** · Affected files: `security-tab.tsx:84-92`, `time-zone-row.tsx:21-25`, `edit-workspace-sheet.tsx:23`, `workspace-tab.tsx:34`, `members-clients-view.tsx:62-68`, `edit-client-sheet.tsx:38-45`, `src/lib/initials.ts`, `features/auth/mfa-actions.ts:12`, `features/onboarding/types.ts:3`
* **What is wrong:** Small helpers are copied:
  * the "is browser" hook, twice
  * `APP_DOMAIN`, twice. Its `?? 'yourdomain.com'` fallback never runs, because `env.ts` requires the variable.
  * `initialsOf`, three times, and the copies disagree on an empty name (`'?'` vs `''`)
  * the `ActionResult`/`Result` type, twice. Settings imports it from the onboarding feature.
* **Why it matters:** Copies drift. The initials copies already behave differently.
* **Recommendation:** Move each helper to one shared file (`src/hooks`, `src/lib`, `src/types`), and import it.

* **RISK-034** · Affected files: `src/lib/role.ts:3`, `src/features/dashboard/types.ts:3`, `src/features/people/types.ts:3`, `src/lib/dal.ts:1,64`, `src/features/settings/queries.ts:22,70-77`
* **What is wrong:** Role and type definitions are loose or duplicated:
  * `UserRole` is defined twice, and `dal.ts` imports the dashboard copy.
  * `WorkspaceRole` is only an alias for `UserRole`.
  * `AccountDTO.role` is a plain `string`.
  * The settings queries cast RPC columns with `as string | null`, and select a `user_id` they never use.
* **Why it matters:** Plain strings let wrong role values through, and the casts hide type errors.
* **Recommendation:** Keep one `UserRole` in `src/lib/role.ts`, type `AccountDTO.role` as `UserRole | null`, and fix the generated function types.

* **RISK-035** · Affected files: `src/lib/dal.ts`, `src/features/settings/components/workspace-tab.tsx:20`
* **What is wrong:** `dal.ts` has no `import 'server-only'`, and a client component imports `AccountDTO` without `import type`.
* **Why it matters:** Nothing breaks today. Without the guard, a future value import could bundle server code into the browser build.
* **Recommendation:** Add `import 'server-only'` to `dal.ts`, and use `import type` in client components.

* **RISK-036** · Affected files: `src/features/people/actions.ts:294,393-428`, `src/features/people/schemas.ts:43`, `src/features/people/queries.ts:168,191-212`, `src/features/people/components/new-client-sheet.tsx:279-344`, `src/features/projects/components/deliverables/deliverables-card.tsx`
* **What is wrong:** There is dead code:
  * `inviteClientAction` has no callers, but it is still a live public endpoint.
  * `deactivateClientAction` repeats `setClientStatusAction(false)`.
  * `NewClientInput` is unused.
  * `inviteStatus` and `projectOptions` are computed but never used.
  * A large JSX block is commented out.
  * `deliverables-card.tsx` is imported nowhere.
* **Why it matters:** Unused server actions are still reachable from the internet. The other dead code hides the real flow.
* **Recommendation:** Wire `inviteClientAction` into the client sheet or delete it, keep one deactivate path, and remove the rest.

* **RISK-037** · Affected files: `src/app/[org]/people/page.tsx:16`, `src/features/people/components/members-clients-view.tsx`, `src/features/people/queries.ts` (`getMembersClientsData`), `@/skeleton/members-clients`, `src/features/people/actions.ts`
* **What is wrong:** The move from "Members & clients" to "People" was not finished. The page title still says "Members & clients" while the heading says "People". The component, query and skeleton names use the old name, and the revalidate paths point at the old route (RISK-012).
* **Why it matters:** New code copies the old name and path, which is how RISK-012 happened.
* **Recommendation:** Rename to `people` throughout in one pass.

* **RISK-038** · Affected files: `src/features/people/components/new-client-sheet.tsx:21`, the other three people sheets
* **What is wrong:** One sheet imports `Sheet` from `@/components/shared/fx-sheet`, and the others import it from `@/components/ui/sheet`.
* **Why it matters:** The sheets can look and behave slightly differently.
* **Recommendation:** Use one import everywhere.

* **RISK-039** · Affected files: `src/features/people/components/members-clients-view.tsx` (667 lines)
* **What is wrong:** The whole People page is one client component, including the header, cards and tables that only need a few click handlers.
* **Why it matters:** More JavaScript ships to the browser than needed, and the server cannot stream the static parts.
* **Recommendation:** Render the static parts on the server, and keep small client pieces for the buttons and sheets.

* **RISK-040** · Affected files: `src/features/people/actions.ts:540,546-559`, `revoke_user_sessions`
* **What is wrong:** Deactivating someone in one workspace deletes **all** their sessions.
* **Why it matters:** They are signed out of every other workspace they belong to as well.
* **Recommendation:** Accept and document this, or revoke sessions only when the person has no other active membership.

## 🧪 4. Required Test Cases

| Risk ID | Test | Should prove |
| --- | --- | --- |
| RISK-001 | Call `safeNextPath('/\\evil.com')`, `safeNextPath('/%5Cevil.com')` (decoded) and `safeNextPath('/\tevil.com')` | Each returns `/` |
| RISK-001 | Signed in without 2FA, request `/sign-in/verify?next=/%5Cevil.com` | Redirect `Location` stays on the app's own origin |
| RISK-001 | Call `safeNextPath('/acme/settings?tab=security')` | The same path comes back unchanged (valid paths still work) |
| RISK-002 | As a manager, call `rpc('update_membership_details', { target_membership_id: own, new_role: 'admin', … })` | Rejected with 42501; the role is unchanged |
| RISK-002 | As a manager, `update memberships set status=false` on a contributor, and insert an invitation with `role='admin'` | Both fail under RLS |
| RISK-002 | As an admin, change a contributor to manager | Still succeeds (no regression for admins) |
| RISK-003 | As a contributor, request `/{org}/people` | 404; no emails in the response |
| RISK-003 | As a manager and as an admin, request `/{org}/people` | The page loads with data |
| RISK-004 | As an admin at the seat limit, call `inviteTeam` directly with 3 invites | Rejected, or not callable as an action; no invitations created |
| RISK-004 | Call it with an invalid email and `role: 'primary_admin'` | Rejected by validation |
| RISK-005 | Render the People view as an admin | No Deactivate button |
| RISK-005 | Render it as the primary admin and deactivate a contributor | The button shows and the action succeeds |
| RISK-006 | Member with no profile name; change only their role and save | `profiles.full_name` stays `null` |
| RISK-006 | Member named "Priya"; change only the job title | The name stays "Priya"; no extra name write |

## 🏁 5. Verdict

**CRITICAL.** The Settings and People screens mostly follow sound patterns: server actions return clear results, optimistic updates roll back, and most rules are also enforced in SQL. But the database lets a manager make themselves admin (RISK-002), contributors can read the whole team's emails by URL (RISK-003), and the redirect check sends people off-site (RISK-001). Fix RISK-002 first, because it is live and needs only a manager login.

## 📋 6. Risk Tracking Table

| Risk ID | Priority | Risk (Short Description) | File | Completed | Reason if Not Completed |
| ------- | -------- | ------------------------ | ---- | --------- | ----------------------- |
| RISK-001 | High | Open redirect through backslash in next | `src/lib/mfa.ts` | Yes | — |
| RISK-002 | High | Manager can promote self to admin | `supabase/schemas/policies/02_rls_memberships.sql` | Yes | — |
| RISK-003 | High | Contributors can read People page data | `src/app/[org]/people/page.tsx` | Yes | — |
| RISK-004 | High | Public inviteTeam skips seat limit | `src/features/onboarding/actions.ts` | Yes | — |
| RISK-005 | High | Deactivate shown to admins always fails | `src/features/people/components/members-clients-view.tsx` | Yes | — |
| RISK-006 | High | Placeholder name saved into real profile | `src/features/people/queries.ts` | Yes | — |
| RISK-007 | Medium | Workspace actions skip input validation | `src/features/settings/actions.ts` | Yes | — |
| RISK-008 | Medium | Unsubscribe link changes data on GET | `src/app/api/digest/unsubscribe/route.ts` | Yes | — |
| RISK-009 | Medium | Formatter uses server zone when automatic | `src/context/locale-provider.tsx` | Yes | — |
| RISK-010 | Medium | Rate-limit failure crashes Settings page | `src/features/settings/actions.ts` | Yes | — |
| RISK-011 | Medium | Fake password last-changed text shown | `src/features/settings/components/security-tab.tsx` | Yes | — |
| RISK-012 | Medium | revalidatePath targets non-existent route | `src/features/people/actions.ts` | Yes | — |
| RISK-013 | Medium | Member role unvalidated, raw DB errors | `src/features/people/actions.ts` | Yes | — |
| RISK-014 | Medium | 2FA reset reaches other workspaces | `src/features/people/actions.ts` | Yes | — |
| RISK-015 | Medium | Seat card disagrees with seat check | `src/features/people/queries.ts` | Yes | — |
| RISK-016 | Medium | Re-invite fails when seats full | `src/features/people/actions.ts` | Yes | — |
| RISK-017 | Medium | Seat limit race on concurrent invites | `src/features/people/actions.ts` | Yes | — |
| RISK-018 | Medium | Client invite sent with portal off | `src/features/people/actions.ts` | Yes | — |
| RISK-019 | Medium | Discarded edits reappear on reopen | `src/features/people/components/edit-member-sheet.tsx` | Yes | — |
| RISK-020 | Medium | Buttons stuck when action throws | `src/features/people/components/edit-member-sheet.tsx` | Yes | — |
| RISK-021 | Medium | Email existence check open to anon | `supabase/schemas/functions/functions.sql` | Yes | — |
| RISK-022 | Medium | No way to reactivate a member | `src/features/people/actions.ts` | Yes | — |
| RISK-023 | Medium | Per-member admin lookups, unused data | `src/features/people/queries.ts` | Yes | — |
| RISK-024 | Medium | People query errors silently ignored | `src/features/people/queries.ts` | Yes | — |
| RISK-025 | Medium | Casts hide null sent to RPC | `src/features/people/actions.ts` | Yes | — |
| RISK-026 | Medium | Device day label uses different zone | `src/features/settings/components/security-tab.tsx` | Yes | — |
| RISK-027 | Medium | Inactivity select not synced from props | `src/features/settings/components/security-tab.tsx` | Yes | — |
| RISK-028 | Medium | Failed inactivity sign-out leaves tab open | `src/components/common/inactivity-watcher.tsx` | Yes | — |
| RISK-029 | Medium | New client form wrong discard prompt | `src/features/people/components/new-client-sheet.tsx` | Yes | — |
| RISK-030 | Medium | Manager rules disagree across app and DB | `src/features/people/actions.ts` | Yes | — |
| RISK-031 | Low | Redirect check duplicated in four files | `src/lib/mfa.ts` | Yes | — |
| RISK-032 | Low | Workspace tab ignores canEdit | `src/features/settings/components/workspace-tab.tsx` | No | _Pending_ |
| RISK-033 | Low | Small helpers copied across files | `src/features/settings/components/security-tab.tsx` | No | _Pending_ |
| RISK-034 | Low | Duplicate and loose role types | `src/lib/role.ts` | No | _Pending_ |
| RISK-035 | Low | dal.ts missing server-only guard | `src/lib/dal.ts` | No | _Pending_ |
| RISK-036 | Low | Dead actions, types and commented JSX | `src/features/people/actions.ts` | No | _Pending_ |
| RISK-037 | Low | Members-clients rename left unfinished | `src/app/[org]/people/page.tsx` | No | _Pending_ |
| RISK-038 | Low | Sheet imported from two places | `src/features/people/components/new-client-sheet.tsx` | No | _Pending_ |
| RISK-039 | Low | Whole People page is client-rendered | `src/features/people/components/members-clients-view.tsx` | No | _Pending_ |
| RISK-040 | Low | Deactivation signs out every workspace | `src/features/people/actions.ts` | No | _Pending_ |

> Update the **Completed** column as you fix each item. If a risk will not be fixed, replace `_Pending_` with the reason (for example: "Deferred to Q3 — requires auth refactor" or "Accepted risk — internal admin page only").
