import { AnalyticsClient } from './AnalyticsClient';

export const revalidate = 60;

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold text-text-primary">Analytics</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-text-muted">
        Mix & match variables — Line / Bar / Radar / Scatter / Area
      </p>
      <AnalyticsClient />
    </div>
  );
}
