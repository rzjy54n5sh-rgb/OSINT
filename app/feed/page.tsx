import { FeedClient } from './FeedClient';

export const revalidate = 60;

export default function FeedPage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold text-text-primary">Live Feed</h1>
      <FeedClient />
    </div>
  );
}
