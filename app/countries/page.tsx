import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const revalidate = 300;

export default async function CountriesPage() {
  let countries: { country_code: string; country_name: string; nai_category: string | null }[] = [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('country_reports')
      .select('country_code, country_name, nai_category')
      .order('country_name');
    countries = (data ?? []) as typeof countries;
  } catch {
    // No Supabase or table missing
  }

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold text-text-primary">Country Reports</h1>
      {countries.length === 0 ? (
        <div className="mt-8 rounded-lg border border-[var(--border)] bg-bg-card p-12 text-center">
          <p className="font-mono text-sm uppercase tracking-wider text-text-muted">
            Awaiting data feed...
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => (
            <Link
              key={c.country_code}
              href={`/countries/${c.country_code.toLowerCase()}`}
              className="osint-card block rounded-lg bg-bg-card p-4 transition hover:shadow-[inset_0_0_30px_rgba(232,197,71,0.06)]"
            >
              <span className="font-heading font-semibold text-text-primary">{c.country_name}</span>
              {c.nai_category && (
                <span className="ml-2 font-mono text-[10px] uppercase text-text-muted">
                  {c.nai_category}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
