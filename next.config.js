const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, './'),
  // Inline at build so client bundle has Supabase URL/key (CI: set via .env.production or workflow env)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
  // Security headers (CSP, HSTS, etc.) are set ONLY in middleware via lib/security-headers.ts.
  // A headers() block here is ALSO applied by OpenNext, which duplicated every header value.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.flickr.com' },
      { protocol: 'https', hostname: '**.staticflickr.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: '**.ytimg.com' },
      { protocol: 'https', hostname: 't2.gstatic.com' },
    ],
  },
  // ISR pages answer with `s-maxage=<revalidate>, stale-while-revalidate=<expireTime - revalidate>`
  // (Next always emits the SWR part). NOTE: Cloudflare (Workers Cache) does NOT serve stale when
  // s-maxage is present — after s-maxage expires the next request waits for a fresh render — so the
  // SWR value has no effect at the edge. expireTime only bounds it (default 1 year) for any other
  // shared cache. (Caching key only; no header config here.)
  expireTime: 86400,
};

module.exports = nextConfig;
