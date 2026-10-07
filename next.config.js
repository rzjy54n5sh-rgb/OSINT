const path = require('path');

const CSP_HEADER =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://plausible.io https://js.stripe.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https: blob:; " +
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.stripe.com https://api.resend.com; " +
  "frame-src https://js.stripe.com https://hooks.stripe.com; " +
  "frame-ancestors 'none';";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, './'),
  // Inline at build so client bundle has Supabase URL/key (CI: set via .env.production or workflow env)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP_HEADER },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
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
