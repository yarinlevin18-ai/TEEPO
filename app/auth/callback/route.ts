import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * OAuth PKCE callback for Supabase Google sign-in.
 *
 * Flow:
 *   1. User completes Google sign-in; Supabase redirects here with `?code=<pkce_code>`.
 *   2. We exchange the code for a session via `exchangeCodeForSession`. That call
 *      returns Google's `provider_token` + `provider_refresh_token` in the response
 *      — but Supabase does NOT store them on the session cookie, so by the time
 *      the client reads `getSession()` they're gone. Without `provider_refresh_token`
 *      we have nothing to call /api/auth/refresh-google with, so Drive 401's after
 *      one hour and never recovers.
 *   3. We forward both provider tokens to the client in the URL hash (`#...`).
 *      Hashes never leave the browser, so this stays out of server logs and the
 *      referer header. The client's auth-context.tsx pulls them off the URL,
 *      stores them in localStorage, then cleans up the URL so a refresh doesn't
 *      re-process the same hash.
 *   4. Middleware then sees the sb-<ref>-auth-token cookie and lets the
 *      request through.
 *
 * On any failure we redirect back to /auth with an error query param so the UI can
 * surface it instead of silently looping.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/dashboard'
  // Only allow same-origin redirects (defense against open-redirect abuse).
  const next = nextParam.startsWith('/') ? nextParam : '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=no_code`)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/auth?error=missing_env`)
  }

  // We need a placeholder response to attach the cookie writes to. The final
  // redirect URL is computed AFTER exchange so we can append the provider
  // tokens to the hash; we mutate `response.headers.set('Location', ...)`
  // when the time comes.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name: string) => request.cookies.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        response.cookies.set({ name, value, ...options })
      },
      remove: (name: string, options: CookieOptions) => {
        response.cookies.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
  })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const msg = encodeURIComponent(error.message)
    return NextResponse.redirect(
      `${origin}/auth?error=exchange_failed&error_description=${msg}`
    )
  }

  // Forward provider_token + provider_refresh_token via URL hash so the
  // client can persist them. The hash is never sent to the server, so it
  // doesn't appear in server access logs, referer headers, or analytics.
  const providerToken = data.session?.provider_token
  const providerRefreshToken = data.session?.provider_refresh_token
  if (providerToken || providerRefreshToken) {
    const hash = new URLSearchParams()
    if (providerToken) hash.set('provider_token', providerToken)
    if (providerRefreshToken) hash.set('provider_refresh_token', providerRefreshToken)
    const target = `${origin}${next}#${hash.toString()}`
    response.headers.set('Location', target)
  }

  return response
}
