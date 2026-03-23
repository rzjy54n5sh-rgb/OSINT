# Cursor Prompt — MENA Intel Desk

Write a Cursor prompt for: $ARGUMENTS

## Required Format

Use this exact structure:

```
╔══════════════════════════════════════════════════════════════╗
║  CURSOR PROMPT — [FEATURE/FIX NAME]                          ║
╚══════════════════════════════════════════════════════════════╝

PLATFORM: MENA Intel Desk
Stack: Next.js 15.2.9 + Supabase + Cloudflare Workers (OpenNext 1.17.1)
All 14 phases of the build are COMPLETE. Do not touch completed components.

[TASK DESCRIPTION]

────────────────────────────────────────────────────────────────
SECURITY REQUIREMENTS (enforce always):
- CVE-2025-29927: Every admin Server Component must independently verify:
    const user = await getUser(); if (!user) redirect('/login');
    const { data: adminUser } = await adminClient.from('admin_users')
      .select('role, is_active').eq('user_id', user.id).single();
    if (!adminUser?.is_active) redirect('/');
- No global Supabase clients — create new client per request
- SUPABASE_SERVICE_ROLE_KEY never client-side (never NEXT_PUBLIC_)
- writeAuditLog() before every admin write action

DO NOT TOUCH:
- /collaboration/ folder
- wrangler.jsonc WORKER_SELF_REFERENCE binding
- Any existing Edge Functions unless explicitly in scope
- All completed admin pages not in scope

────────────────────────────────────────────────────────────────
VERIFICATION CHECKLIST — ALL MUST PASS:
[ ] npm run build → 0 errors, 0 warnings
[ ] npm run type-check → 0 errors
[ ] [specific testable check]
[ ] [specific testable check]
[ ] git add -A && git commit -m "[description] ✓"
```

## Rules for the prompt
- Self-contained — Cursor must not need other prompts to understand context
- Every function signature and behavior fully specified — no ambiguity
- Checklist items are concrete and testable (commands, SQL queries, browser observations)
- Never vague like "works correctly" — always specify what to observe
