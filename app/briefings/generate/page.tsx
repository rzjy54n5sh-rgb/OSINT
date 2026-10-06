import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';

// The manual briefing-generation API route was retired (2026-10-06): it wrote unsourced
// model output into daily_briefings. This page remains only so old links land
// on an explanation instead of a 404.
export default function GenerateBriefingRetiredPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link href="/briefings" className="font-mono text-xs mb-6 inline-block"
            style={{ color: 'var(--accent-gold)' }}>
        ← BRIEFINGS
      </Link>
      <OsintCard>
        <h1 className="font-display text-lg mb-3" style={{ color: 'var(--text-primary)' }}>
          MANUAL BRIEFING GENERATION RETIRED
        </h1>
        <p className="font-body text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Briefings are produced by the Claude daily build; manual generation is retired.
        </p>
      </OsintCard>
    </div>
  );
}
