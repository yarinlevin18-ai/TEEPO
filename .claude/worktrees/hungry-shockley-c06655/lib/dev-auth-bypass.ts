/**
 * Dev-only auth bypass.
 *
 * Set NEXT_PUBLIC_DEV_BYPASS_AUTH=true in .env.local to skip the OAuth flow
 * during local development. This injects a fake user so /dashboard renders
 * without signing in.
 *
 * Hard guard: this is a no-op when NODE_ENV === 'production'. Even if the env
 * var leaks into a production build, the bypass refuses to activate.
 *
 * NEVER set this flag in Vercel/Render production environment variables.
 */

import type { User, Session } from '@supabase/supabase-js'

export function isDevAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'
}

const FAKE_USER_ID = '00000000-0000-0000-0000-000000000dev'
const FAKE_EMAIL = 'dev@localhost.test'

export const FAKE_USER: User = {
  id: FAKE_USER_ID,
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: {
    name: 'Dev User',
    full_name: 'Dev User',
    email: FAKE_EMAIL,
    avatar_url: '',
  },
  aud: 'authenticated',
  email: FAKE_EMAIL,
  created_at: '2026-01-01T00:00:00.000Z',
  role: 'authenticated',
}

export const FAKE_SESSION: Session = {
  access_token: 'dev-bypass-access-token',
  refresh_token: 'dev-bypass-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: FAKE_USER,
  provider_token: 'dev-bypass-google-token',
  provider_refresh_token: 'dev-bypass-google-refresh',
}
