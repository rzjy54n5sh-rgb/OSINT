import { TimelineClient } from './TimelineClient';

export const revalidate = 60;

export default function TimelinePage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold text-text-primary">Timeline</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-text-muted">
        Horizontal scroll — overlay up to 4 variables
      </p>
      <TimelineClient />
    </div>
  );
}
