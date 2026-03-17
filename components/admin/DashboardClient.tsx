'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RealtimeDashboard } from '@/components/admin/RealtimeDashboard';
import type { AdminRole } from '@/types';
import type { PipelineRun } from '@/types';
import type { PlatformAlert } from '@/types';

type DashboardClientProps = {
  role: AdminRole;
  conflictDay: number;
  tierCounts: { free: number; informed: number; professional: number };
  mrrByCurrency: Record<string, number>;
  latestRun: PipelineRun | null;
  openDisputesCount: number;
  alerts: PlatformAlert[];
  scenarioProbabilities: { scenario_a?: number; scenario_b?: number; scenario_c?: number } | null;
  auditEntries: { id: string; action_type: string; action_summary: string; created_at: string; is_ai_request?: boolean }[];
  failingSourcesCount: number;
  pricingSnapshot: { key: string; value: unknown }[];
  recentUsers: { id: string; email: string; display_name?: string; tier: string; created_at: string }[];
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`p-4 rounded border ${className}`}
      style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}
    >
      {children}
    </div>
  );
}

export function DashboardClient({
  conflictDay,
  tierCounts,
  mrrByCurrency,
  latestRun,
  openDisputesCount,
  alerts,
  scenarioProbabilities,
  auditEntries,
  failingSourcesCount,
  pricingSnapshot,
  recentUsers,
}: DashboardClientProps) {
  const router = useRouter();
  const scenario = scenarioProbabilities ?? {};
  const scA = (scenario.scenario_a ?? 0) * 100;
  const scB = (scenario.scenario_b ?? 0) * 100;
  const scC = (scenario.scenario_c ?? 0) * 100;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <RealtimeDashboard onPipelineUpdate={() => router.refresh()} onAlertsUpdate={() => router.refresh()} />
      {alerts.length > 0 && (
        <div
          className="p-4 rounded border"
          style={{ borderColor: 'var(--accent-gold)', background: 'rgba(232,197,71,0.12)' }}
        >
          <p className="font-mono text-sm" style={{ color: 'var(--accent-gold)' }}>
            ◆ {alerts[0].title || 'Alert'} — {alerts[0].message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <p className="font-mono text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Conflict Day</p>
          <p className="text-2xl font-mono" style={{ color: 'var(--accent-red)' }}>{conflictDay}</p>
        </Card>
        <Card>
          <p className="font-mono text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Users</p>
          <p className="text-2xl font-mono" style={{ color: 'var(--text-primary)' }}>
            {tierCounts.free + tierCounts.informed + tierCounts.professional}
          </p>
          <p className="font-mono text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            F:{tierCounts.free} I:{tierCounts.informed} P:{tierCounts.professional}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>MRR</p>
          <p className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
            {Object.entries(mrrByCurrency)
              .sort(([a], [b]) => {
                const order = ['usd', 'aed', 'egp'];
                const i = order.indexOf(a.toLowerCase());
                const j = order.indexOf(b.toLowerCase());
                if (i !== -1 && j !== -1) return i - j;
                if (i !== -1) return -1;
                if (j !== -1) return 1;
                return a.localeCompare(b);
              })
              .map(([cur, amt]) => {
                const display = typeof amt === 'number' ? (amt >= 100 ? (amt / 100).toLocaleString() : String(amt)) : String(amt);
                const label = cur.toUpperCase();
                return label === 'USD' ? `$${display} USD` : `${display} ${label}`;
              })
              .join(' | ') || '—'}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Pipeline</p>
          <p className="font-mono text-sm" style={{ color: latestRun ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {latestRun
              ? `${latestRun.status} · ${latestRun.stage}`
              : 'No runs'}
          </p>
          {latestRun?.duration_seconds != null && (
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{latestRun.duration_seconds}s</p>
          )}
        </Card>
        <Card>
          <p className="font-mono text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Disputes</p>
          <p className="text-2xl font-mono" style={{ color: openDisputesCount > 0 ? 'var(--accent-orange)' : 'var(--text-primary)' }}>
            {openDisputesCount}
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="font-mono text-xs uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Scenario probabilities (read-only)</h3>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>A</p>
            <div className="h-8 border rounded overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="h-full bg-green-600/80" style={{ width: `${scA}%` }} />
            </div>
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>B</p>
            <div className="h-8 border rounded overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="h-full bg-blue-600/80" style={{ width: `${scB}%` }} />
            </div>
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>C</p>
            <div className="h-8 border rounded overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="h-full bg-amber-600/80" style={{ width: `${scC}%` }} />
            </div>
          </div>
        </div>
      </Card>

      {latestRun && (
        <Card>
          <h3 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Last pipeline run</h3>
          <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
            {new Date(latestRun.started_at).toLocaleString()} · {latestRun.stage} · {latestRun.status}
            {latestRun.duration_seconds != null && ` · ${latestRun.duration_seconds}s`}
            {latestRun.countries_processed != null && ` · ${latestRun.countries_processed} countries`}
            {latestRun.articles_ingested != null && ` · ${latestRun.articles_ingested} articles`}
          </p>
        </Card>
      )}

      <Card>
        <h3 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Recent signups</h3>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="text-left py-1">Email</th>
              <th className="text-left py-1">Tier</th>
              <th className="text-left py-1">Joined</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {recentUsers.map((u) => (
              <tr key={u.id}>
                <td className="py-1">{u.email}</td>
                <td className="py-1">{u.tier}</td>
                <td className="py-1">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Pricing snapshot (USD)</h3>
        <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
          {pricingSnapshot.map((r) => (
            <span key={r.key}>{r.key}: {String(r.value)} </span>
          ))}
          {pricingSnapshot.length === 0 && '—'}
        </p>
      </Card>

      <Card>
        <h3 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Audit log (last 6)</h3>
        <ul className="space-y-1 font-mono text-xs">
          {auditEntries.slice(0, 6).map((e) => (
            <li
              key={e.id}
              style={{
                color: e.is_ai_request ? '#a855f7' : 'var(--text-secondary)',
              }}
            >
              {new Date(e.created_at).toLocaleString()} — {e.action_type}: {e.action_summary}
            </li>
          ))}
        </ul>
      </Card>

      {failingSourcesCount > 0 && (
        <Card>
          <p className="font-mono text-xs" style={{ color: 'var(--accent-orange)' }}>
            {failingSourcesCount} failing source(s).{' '}
            <Link href="/admin/sources" className="underline" style={{ color: 'var(--accent-gold)' }}>
              → Sources
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}
