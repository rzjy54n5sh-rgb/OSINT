import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-12">
      <section className="mb-16 text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-text-primary md:text-5xl">
          MENA INTEL DESK
        </h1>
        <p className="mt-4 font-sans text-lg font-light text-text-secondary">
          OSINT conflict intelligence dashboard
        </p>
      </section>
      <nav className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardLink href="/feed" title="Live Feed" desc="Real-time article stream with filters" />
        <DashboardLink href="/nai" title="NAI World Map" desc="Choropleth by NAI category + time scrubber" />
        <DashboardLink href="/analytics" title="Analytics" desc="Mix & match variables, charts, export" />
        <DashboardLink href="/timeline" title="Timeline" desc="Conflict day timeline with overlays" />
        <DashboardLink href="/countries" title="Country Reports" desc="Per-country NAI and modules" />
        <DashboardLink href="/scenarios" title="Scenario Tracker" desc="Scenario probabilities and indicators" />
        <DashboardLink href="/disinfo" title="Disinformation Tracker" desc="Claims and verdicts" />
      </nav>
    </div>
  );
}

function DashboardLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="osint-card block rounded-lg bg-bg-card p-6 transition hover:shadow-[inset_0_0_30px_rgba(232,197,71,0.06)]"
    >
      <h2 className="font-heading text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 font-sans text-sm text-text-secondary">{desc}</p>
    </Link>
  );
}
