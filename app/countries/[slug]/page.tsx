import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export const revalidate = 300;

interface CountryReportRow {
  country_name: string;
  nai_score: number | null;
  nai_category: string | null;
  updated_at: string;
  content_json: Record<string, unknown> | null;
}

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const code = slug.toUpperCase();
  let report: CountryReportRow | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('country_reports')
      .select('*')
      .eq('country_code', code)
      .single();
    report = data as CountryReportRow | null;
  } catch {
    // env or table missing
  }
  if (!report) notFound();

  const content = (report.content_json ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="font-heading text-3xl font-semibold text-text-primary">
          {report.country_name}
        </h1>
        {report.nai_score != null && (
          <span className="rounded bg-bg-elevated px-2 py-1 font-mono text-sm text-accent-gold">
            NAI {Number(report.nai_score).toFixed(1)}
          </span>
        )}
        {report.nai_category && (
          <span className="osint-label text-text-muted">{report.nai_category}</span>
        )}
        <span className="osint-label text-text-muted">
          Updated {new Date(report.updated_at).toISOString().slice(0, 10)}
        </span>
      </header>

      <div className="space-y-6">
        {content.social_media_trends !== undefined && content.social_media_trends !== null && (
          <section className="osint-card rounded-lg bg-bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-text-primary">
              Social Media Trends
            </h2>
            <pre className="mt-2 overflow-auto font-mono text-xs text-text-secondary">
              {JSON.stringify(content.social_media_trends, null, 2)}
            </pre>
          </section>
        )}
        {content.official_media_stance !== undefined && content.official_media_stance !== null && (
          <section className="osint-card rounded-lg bg-bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-text-primary">
              Official Media Stance
            </h2>
            <pre className="mt-2 overflow-auto font-mono text-xs text-text-secondary">
              {JSON.stringify(content.official_media_stance, null, 2)}
            </pre>
          </section>
        )}
        {!content.social_media_trends && !content.official_media_stance && (
          <div className="rounded-lg border border-[var(--border)] bg-bg-card p-8 text-center">
            <p className="font-mono text-sm uppercase tracking-wider text-text-muted">
              Modules will render from content_json when available
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
