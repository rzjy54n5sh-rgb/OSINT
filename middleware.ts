import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;
const store = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip ?? 'unknown';
  return ip;
}

export function middleware(request: NextRequest) {
  const key = getClientKey(request);
  const now = Date.now();
  let entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const res = NextResponse.next();
  res.headers.set('X-RateLimit-Limit', String(RATE_LIMIT));
  res.headers.set('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT - entry.count)));
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
