-- ============================================================
-- subscription_status: add the Stripe states the enum was missing
--
-- stripe-webhook writes `subscription.status` straight into
-- subscriptions.status. Stripe's vocabulary is:
--
--   incomplete, incomplete_expired, trialing, active,
--   past_due, canceled, unpaid, paused
--
-- The enum held only active/trialing/past_due/cancelled/expired, so
-- four of those eight raised invalid_text_representation inside the
-- handler's try block -> 500 -> Stripe retries the event indefinitely.
-- A cancellation is the most likely one to hit in practice.
--
-- `canceled` is NOT added. Stripe spells it with one L and this enum
-- with two; the webhook translates that single case, so existing rows
-- keep working and there is no duplicate spelling in the type.
--
-- Written by hand rather than left to `db diff`: enum changes are the
-- case pgdelta is least reliable on, and ADD VALUE IF NOT EXISTS is
-- idempotent, so re-running is harmless. schemas/types/types.sql lists
-- these in the same order, so the declarative schema stays in step.
--
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction on PG12+
-- provided the new value is not USED in the same transaction. Nothing
-- below uses them.
-- ============================================================

alter type public.subscription_status add value if not exists 'incomplete';
alter type public.subscription_status add value if not exists 'incomplete_expired';
alter type public.subscription_status add value if not exists 'unpaid';
alter type public.subscription_status add value if not exists 'paused';
