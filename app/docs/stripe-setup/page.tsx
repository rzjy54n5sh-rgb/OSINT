import fs from 'fs';
import path from 'path';
import Link from 'next/link';

export default function StripeSetupDocPage() {
  const filePath = path.join(process.cwd(), 'docs', 'stripe-setup.md');
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    content = 'docs/stripe-setup.md not found.';
  }
  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <Link href="/admin/pricing" className="font-mono text-xs mb-4 inline-block" style={{ color: 'var(--accent-gold)' }}>
        ← Back to Pricing
      </Link>
      <h1 className="font-mono text-sm uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
        docs/stripe-setup.md
      </h1>
      <pre className="font-mono text-xs whitespace-pre-wrap break-words p-4 rounded border overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
        {content}
      </pre>
    </div>
  );
}
