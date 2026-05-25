/** @type {import('next').NextConfig} */

// Content Security Policy — tightened for Supabase + Google OAuth + Google Drive/Calendar APIs.
// Note: Next.js in dev needs 'unsafe-eval'; we relax it only outside production.
const isDev = process.env.NODE_ENV !== 'production'

// Allow the configured Flask backend (Render) + any *.onrender.com fallback
// so production fetches from the dashboard pages aren't blocked by CSP.
const backendOrigin = (() => {
  try {
    if (process.env.NEXT_PUBLIC_BACKEND_URL) return new URL(process.env.NEXT_PUBLIC_BACKEND_URL).origin
  } catch {}
  return ''
})()

const connectSrc = [
  "'self'",
  backendOrigin,
  'https://*.onrender.com',
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://accounts.google.com',
  'https://oauth2.googleapis.com',
  'https://www.googleapis.com',
  'https://apis.google.com',
  isDev ? 'http://localhost:5000' : '',
  isDev ? 'ws://localhost:*' : '',
  'https://my.spline.design',
  'https://prod.spline.design',
  'https://*.spline.design',
].filter(Boolean).join(' ')

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://accounts.google.com https://apis.google.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src ${connectSrc}`,
  "frame-src https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
]

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  i18n: {
    locales: ['he'],
    defaultLocale: 'he',
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
