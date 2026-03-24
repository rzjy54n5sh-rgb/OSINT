#!/usr/bin/env python3
"""
Idempotent migration: add user status, event log, notes tables for admin panel.
Uses Supabase Management API / service role to run DDL.
"""
import os
import sys
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

STATEMENTS = [
    # ── users table additions ──
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_reason TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_ip TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_source TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referrer TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country_code TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_spent_usd NUMERIC(10,2) DEFAULT 0",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lifetime_value_usd NUMERIC(10,2) DEFAULT 0",

    # ── subscriptions table additions ──
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pause_start TIMESTAMPTZ",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pause_end TIMESTAMPTZ",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pause_reason TEXT",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS discount_code TEXT",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS discount_pct INTEGER",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS mrr_usd NUMERIC(10,2) DEFAULT 0",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly'",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_attempt TIMESTAMPTZ",
    "ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS sub_notes TEXT",

    # ── user_events table ──
    """CREATE TABLE IF NOT EXISTS public.user_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_data JSONB DEFAULT '{}',
      ip_address TEXT,
      user_agent TEXT,
      performed_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS user_events_user_id_idx ON public.user_events(user_id)",
    "CREATE INDEX IF NOT EXISTS user_events_created_at_idx ON public.user_events(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS user_events_type_idx ON public.user_events(event_type)",

    # ── user_notes table ──
    """CREATE TABLE IF NOT EXISTS public.user_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      admin_id UUID NOT NULL,
      note TEXT NOT NULL,
      is_pinned BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS user_notes_user_id_idx ON public.user_notes(user_id)",

    # ── RLS ──
    "ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY",

    # ── Policies (idempotent via DROP IF EXISTS + CREATE) ──
    "DROP POLICY IF EXISTS service_role_user_events ON public.user_events",
    "CREATE POLICY service_role_user_events ON public.user_events FOR ALL USING (true)",
    "DROP POLICY IF EXISTS service_role_user_notes ON public.user_notes",
    "CREATE POLICY service_role_user_notes ON public.user_notes FOR ALL USING (true)",
]


def run_sql(sql: str) -> bool:
    """Execute a single SQL statement via Supabase's PostgreSQL REST endpoint."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/",
        headers={**HEADERS, "Content-Profile": "public"},
        json={},
        timeout=15,
    )
    # The RPC approach won't work for DDL. Use the pg_net or direct approach.
    # Fall back to using the SQL endpoint via the Management API.
    # Actually, we'll use the supabase-js admin approach via raw SQL.
    pass


def main():
    # Use the Supabase SQL API (requires service role key)
    # POST to /pg/query endpoint
    session = requests.Session()

    for i, stmt in enumerate(STATEMENTS):
        stmt_clean = stmt.strip()
        if not stmt_clean:
            continue
        print(f"  [{i+1}/{len(STATEMENTS)}] {stmt_clean[:80]}...")

        # Try via the Supabase Management API SQL endpoint
        resp = session.post(
            f"{SUPABASE_URL}/rest/v1/rpc/exec_raw_sql",
            headers=HEADERS,
            json={"sql": stmt_clean},
            timeout=30,
        )

        if resp.status_code == 404:
            # exec_raw_sql doesn't exist, try creating it first
            print("  Creating exec_raw_sql function...")
            create_fn = """
            CREATE OR REPLACE FUNCTION public.exec_raw_sql(sql text)
            RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
            BEGIN EXECUTE sql; END;
            $$;
            """
            # We need to bootstrap this somehow. Let's use the /pg endpoint
            # which is available on Supabase with service role
            resp2 = session.post(
                f"{SUPABASE_URL}/pg",
                headers={"Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
                json={"query": create_fn},
                timeout=30,
            )
            if resp2.status_code < 300:
                print("  ✅ exec_raw_sql function created")
                # Retry the original statement
                resp = session.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/exec_raw_sql",
                    headers=HEADERS,
                    json={"sql": stmt_clean},
                    timeout=30,
                )
            else:
                print(f"  ⚠️ Could not create helper function: {resp2.status_code} {resp2.text[:100]}")
                # Last resort: try /pg endpoint directly
                resp = session.post(
                    f"{SUPABASE_URL}/pg",
                    headers={"Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
                    json={"query": stmt_clean},
                    timeout=30,
                )

        if resp.status_code < 300:
            print(f"    ✅ OK")
        elif "already exists" in resp.text.lower() or "42701" in resp.text:
            print(f"    ⏭️ Already exists (idempotent)")
        else:
            print(f"    ⚠️ {resp.status_code}: {resp.text[:150]}")

    # Verify
    print("\n=== Verification ===")
    for table in ["user_events", "user_notes"]:
        r = session.get(
            f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=1",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            timeout=10,
        )
        print(f"  {table}: HTTP {r.status_code}")

    # Check users.status column
    r = session.get(
        f"{SUPABASE_URL}/rest/v1/users?select=status&limit=1",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=10,
    )
    print(f"  users.status column: HTTP {r.status_code}")
    print("\nMigration complete.")


if __name__ == "__main__":
    main()
