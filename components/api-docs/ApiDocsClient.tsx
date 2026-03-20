'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { OsintCard } from '@/components/OsintCard';

interface Props {
  isPro: boolean;
  baseUrl: string;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-xl mt-10 mb-4" style={{ color: 'var(--accent-gold)' }}>
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-mono text-sm uppercase tracking-wider mb-2 mt-6" style={{ color: 'var(--text-primary)' }}>{children}</h3>;
}

export function ApiDocsClient({ isPro, baseUrl }: Props) {
  const showSecrets = isPro;

  const curlNai = `curl -s "${baseUrl}api-nai?day=20" \\
  -H "X-MENA-API-Key: YOUR_API_KEY"`;

  const curlScenarios = `curl -s "${baseUrl}api-scenarios?day=20" \\
  -H "Authorization: Bearer YOUR_SUPABASE_JWT"`;

  const curlCountry = `curl -s "${baseUrl}api-country?code=IR&day=20" \\
  -H "X-MENA-API-Key: YOUR_API_KEY"`;

  const curlDisinfo = `curl -s "${baseUrl}api-disinfo?day=20" \\
  -H "Authorization: Bearer YOUR_SUPABASE_JWT"`;

  const curlDispute = `curl -s -X POST "${baseUrl}api-dispute" \\
  -H "Content-Type: application/json" \\
  -d '{"article_id":"uuid-here","claim_text":"...","source_url":"https://..."}'`;

  const jsonNaiT2 = `{
  "conflictDay": 20,
  "tier": "professional",
  "total": 20,
  "data": [
    {
      "country_code": "IR",
      "expressed_score": 11,
      "latent_score": 39,
      "gap_size": 28,
      "category": "INVERSION",
      "delta": 3,
      "velocity": "up",
      "velocity_delta": 3
    }
  ]
}`;

  const jsonScenarios = `{
  "conflictDay": 20,
  "tier": "informed",
  "current": {
    "conflict_day": 20,
    "scenario_a": 15,
    "scenario_b": 45,
    "scenario_c": 22,
    "scenario_d": 18,
    "scenario_e": 8,
    "updated_at": "2026-03-19T06:00:00Z"
  },
  "history": [],
  "detectedScenarios": []
}`;

  const jsonCountry = `{
  "conflictDay": 20,
  "tier": "professional",
  "data": {
    "country_code": "IR",
    "country_name": "Iran",
    "nai_score": 42,
    "nai_category": "INVERSION",
    "conflict_day": 20,
    "content_json": { "assessment": "...", "key_risks": [] },
    "updated_at": "2026-03-19T06:00:00Z"
  }
}`;

  const jsonDisinfo = `{
  "tier": "informed",
  "conflictDay": 20,
  "total": 42,
  "data": [
    {
      "id": "…",
      "conflict_day": 20,
      "claim": "…",
      "status": "published",
      "verdict": "…",
      "source": "https://…",
      "created_at": "…"
    }
  ]
}`;

  const jsonDispute = `{
  "success": true,
  "disputeId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Dispute submitted successfully."
}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        API REFERENCE
      </h1>
      <p className="font-mono text-xs mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        REST endpoints backed by Supabase Edge Functions. Tier determines fields returned. Historical conflict days are supported
        back to Day 1.
      </p>

      {!isPro && (
        <OsintCard className="mb-8 border" style={{ borderColor: 'var(--accent-gold)' }}>
          <p className="font-mono text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--accent-gold)' }}>◆</span> Upgrade to Professional for API access
          </p>
          <p className="font-mono text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Full authentication details, copyable examples, and complete response payloads are visible with a Professional
            subscription and active API key.
          </p>
          <Link
            href="/pricing"
            className="inline-block font-mono text-xs px-4 py-2 border rounded-sm"
            style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
          >
            View plans →
          </Link>
        </OsintCard>
      )}

      {/* Section 1 — Authentication */}
      <SectionTitle>1. Authentication</SectionTitle>
      {showSecrets ? (
        <div className="space-y-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>API key (Professional):</strong> keys look like{' '}
            <code className="text-[var(--accent-gold)]" translate="no">
              mena_sk_…
            </code>
            . Send as:
          </p>
          <CodeBlock code={`X-MENA-API-Key: mena_sk_your_key_here`} />
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Session JWT:</strong> you may also pass a Supabase user access
            token (tier follows your account):
          </p>
          <CodeBlock code={`Authorization: Bearer YOUR_SUPABASE_JWT`} />
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Base URL:</strong>
          </p>
          <CodeBlock code={baseUrl} />
        </div>
      ) : (
        <div className="relative rounded border overflow-hidden min-h-[140px]" style={{ borderColor: 'var(--border)' }}>
          <div className="blur-md opacity-40 pointer-events-none select-none p-4 font-mono text-xs space-y-2" aria-hidden>
            <p>API keys look like mena_sk_xxxx…</p>
            <p>Authorization: Bearer YOUR_KEY</p>
            <p>{baseUrl}</p>
          </div>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center"
            style={{ background: 'rgba(7,10,15,0.88)' }}
          >
            <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              Authentication details are available on Professional.
            </p>
            <PaywallOverlay requiredTier="professional" featureName="API authentication & keys" compact />
          </div>
        </div>
      )}

      {/* Section 2 — Rate limits */}
      <SectionTitle>2. Rate limits</SectionTitle>
      <ul className="font-mono text-xs space-y-2 list-disc ps-5" style={{ color: 'var(--text-secondary)' }}>
        <li>All tiers: up to <strong style={{ color: 'var(--text-primary)' }}>100 requests/hour</strong> per API key (contact us for higher quotas).</li>
        <li>Bulk or archival use: prefer daily exports / batch workflows where possible.</li>
      </ul>

      {/* Section 3 — Endpoints */}
      <SectionTitle>3. Endpoints</SectionTitle>

      <SubTitle>GET /api-nai</SubTitle>
      <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        Query: <code translate="no">day</code> (optional) — conflict day; omit for latest. Optional <code translate="no">country</code> filter.
      </p>
      <ul className="font-mono text-[11px] space-y-1 mb-2 list-disc ps-5" style={{ color: 'var(--text-muted)' }}>
        <li>
          <strong>T0:</strong> <code translate="no">expressed_score</code>, <code translate="no">delta</code>; category may be hidden — see{' '}
          <code translate="no">_tier_note</code>.
        </li>
        <li>
          <strong>T1+:</strong> + <code translate="no">latent_score</code>, <code translate="no">gap_size</code>, <code translate="no">category</code>.
        </li>
        <li>
          <strong>T1+ (full NAI feature):</strong> + <code translate="no">velocity</code> / <code translate="no">velocity_delta</code> on rows.
        </li>
      </ul>
      <CodeBlock code={curlNai} allowCopy={showSecrets} />
      <p className="font-mono text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
        Example JSON (T2-style)
      </p>
      <CodeBlock code={jsonNaiT2} allowCopy={showSecrets} />

      <SubTitle>GET /api-scenarios</SubTitle>
      <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        Query: <code translate="no">day</code> (optional). <code translate="no">history=true</code> returns extra rows for T1+ with scenario history
        feature enabled.
      </p>
      <p className="font-mono text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
        Free tier receives <code translate="no">conflictDay</code> and <code translate="no">tier</code> with <code translate="no">current: null</code>; Informed
        and Professional receive the <code translate="no">current</code> object with A–E probabilities.
      </p>
      <CodeBlock code={curlScenarios} allowCopy={showSecrets} />
      <CodeBlock code={jsonScenarios} allowCopy={showSecrets} />

      <SubTitle>GET /api-country</SubTitle>
      <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        Query: <code translate="no">code</code> (ISO-style country code, e.g. IR), <code translate="no">day</code> (optional).
      </p>
      <ul className="font-mono text-[11px] space-y-1 mb-2 list-disc ps-5" style={{ color: 'var(--text-muted)' }}>
        <li>
          <strong>T0:</strong> <code translate="no">nai_score</code>, <code translate="no">nai_category</code>; <code translate="no">content_json</code> is null with{' '}
          <code translate="no">_tier_note</code>.
        </li>
        <li>
          <strong>T1:</strong> full <code translate="no">content_json</code> for Egypt / UAE (codes <code translate="no">EGY</code>, <code translate="no">ARE</code>,{' '}
          <code translate="no">UAE</code> in the registry).
        </li>
        <li>
          <strong>T2:</strong> full reports for all countries in the dataset.
        </li>
      </ul>
      <CodeBlock code={curlCountry} allowCopy={showSecrets} />
      <CodeBlock code={jsonCountry} allowCopy={showSecrets} />

      <SubTitle>GET /api-disinfo</SubTitle>
      <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        Query: <code translate="no">day</code> (optional). Row cap is tier-based (5 for free, larger cap for paid tiers); there is no separate{' '}
        <code translate="no">limit</code> query parameter in the current API.
      </p>
      <CodeBlock code={curlDisinfo} allowCopy={showSecrets} />
      <CodeBlock code={jsonDisinfo} allowCopy={showSecrets} />

      <SubTitle>POST /api-dispute</SubTitle>
      <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        Submit a dispute on a claim. Body (JSON): <code translate="no">article_id</code>, <code translate="no">claim_text</code>,{' '}
        <code translate="no">source_url</code> required; <code translate="no">article_url</code> optional.
      </p>
      <CodeBlock code={curlDispute} allowCopy />
      <CodeBlock code={jsonDispute} allowCopy />

      {/* Section 4 */}
      <SectionTitle>4. Historical data</SectionTitle>
      <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
        Pass <code translate="no">day=1</code> … <code translate="no">day=N</code> for any published conflict day. Rate limits apply the same for historical pulls.
      </p>

      {/* Section 5 — Webhook */}
      <SectionTitle>5. Webhooks</SectionTitle>
      <div
        className="rounded border p-4 font-mono text-xs space-y-2"
        style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)' }}
      >
        <p className="uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Coming soon
        </p>
        <p style={{ color: 'var(--text-secondary)' }}>
          Subscribe to pipeline completion events. Available in a future release. If this is a blocker for your use case, reach out via{' '}
          <Link href="/contact" className="underline" style={{ color: 'var(--accent-gold)' }}>
            /contact
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
