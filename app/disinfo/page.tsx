import { DisinfoClient } from './DisinfoClient';

export const revalidate = 60;

export default function DisinfoPage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold text-text-primary">Disinformation Tracker</h1>
      <DisinfoClient />
    </div>
  );
}
