/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable PWA in production via next-pwa or manual service worker
  reactStrictMode: true,
  // RTL support - Hebrew is the primary language
  i18n: {
    locales: ['he'],
    defaultLocale: 'he',
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
}

module.exports = nextConfig
