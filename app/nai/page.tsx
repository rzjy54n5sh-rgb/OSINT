import { NAIMapClient } from './NAIMapClient';

export const revalidate = 300;

export default function NAIPage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold text-text-primary">NAI World Map</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-text-muted">
        Expressed / Latent / Gap — Time scrubber below
      </p>
      <NAIMapClient />
    </div>
  );
}
