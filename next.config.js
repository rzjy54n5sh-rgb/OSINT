const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, './'),
  // Inline at build so client bundle has Supabase URL/key (CI: set via .env.production or workflow env)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
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
};

module.exports = nextConfig;
