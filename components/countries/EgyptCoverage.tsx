import Link from 'next/link';

/**
 * Egypt country page: what the desk covers for Egypt and where it lives (UX audit 2026-10-13: the page
 * read as empty). Describes the platform's own coverage only; it adds no claim about Egypt. Egypt gets
 * no War Posture grade (editorial policy), so its stated positions and acts are a ledger.
 */
export function EgyptCoverage({ ledgerCount, economyBriefDay }: { ledgerCount: number; economyBriefDay: number | null }) {
  const link = { color: 'var(--accent-gold)' } as const;
  return (
    <section className="osint-card p-5 mb-6" aria-labelledby="egypt-coverage-h" data-testid="egypt-coverage">
      <h2 id="egypt-coverage-h" className="font-display text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
        WHAT THE DESK TRACKS FOR EGYPT
      </h2>
      <p className="font-mono text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {ledgerCount === 0
          ? 'No statement or act by the Egyptian government has been recorded in the ledger yet, so the panel above is empty rather than filled with a guess. Egypt is still covered in these places:'
          : 'Egypt is covered in these places:'}
      </p>
      <ul className="space-y-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
        <li>
          <span className="block uppercase text-[11px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
            Stated positions and acts
          </span>
          What Egypt&apos;s government says about continuing the wars, word for word with date and link, and what it
          does (deployments, basing, votes). Shown as a ledger, never as a score.{' '}
          <a href="#war-posture-panel" style={link}>
            Egypt&apos;s stated-positions ledger ↑
          </a>
        </li>
        <li>
          <span className="block uppercase text-[11px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
            Economy
          </span>
          The daily Egypt &amp; Gulf Economy brief: currency, energy, shipping, Suez and market access.{' '}
          <Link prefetch={false} href={economyBriefDay != null ? `/briefings/${economyBriefDay}/egypt_gulf_economy` : '/briefings'} style={link}>
            {economyBriefDay != null ? `Latest Egypt & Gulf Economy brief (Day ${economyBriefDay}) →` : 'Egypt & Gulf Economy briefs →'}
          </Link>
        </li>
        <li>
          <span className="block uppercase text-[11px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
            Pound and shipping indicators
          </span>
          The USD/EGP rate and the Hormuz and Bab al-Mandeb transit counts, each with its source and collection time.{' '}
          <Link prefetch={false} href="/markets" style={link}>
            Markets →
          </Link>
        </li>
      </ul>
    </section>
  );
}
