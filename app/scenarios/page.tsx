import { ScenariosClient } from './ScenariosClient';

export const revalidate = 60;

export default function ScenariosPage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold text-text-primary">Scenario Tracker</h1>
      <ScenariosClient />
    </div>
  );
}
