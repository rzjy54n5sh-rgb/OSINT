/**
 * Explicit column lists for the signed-in visitor's OWN rows (users / subscriptions).
 *
 * These replace select('*') so that a follow-up migration can withdraw the table-level SELECT and
 * stop showing users admin-only fields on their own row (users.notes, tags, last_login_ip,
 * status_reason, suspended_reason; subscriptions.sub_notes …). Keep in sync with types/index.ts
 * `User` / `Subscription`; every column here exists live (information_schema, 2026-10-07).
 */
export const USER_PROFILE_COLUMNS =
  'id, email, display_name, avatar_url, tier, tier_source, stripe_customer_id, country_code, preferred_currency, auth_provider, is_suspended, last_seen_at, timezone, created_at, updated_at';

export const SUBSCRIPTION_COLUMNS =
  'id, user_id, stripe_subscription_id, plan, status, currency, amount, current_period_start, current_period_end, trial_start, trial_end, cancel_at_period_end, created_at, updated_at';
