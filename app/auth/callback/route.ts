import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * OAuth PKCE callback for Supabase Google sign-in.
 *
 * Flow:
 *   1. User completes Google sign-in; Supabase redirects here with `?code=<pkce_code>`.
 *   2. We exchange the code for a session, which sets the sb-<ref>-auth-token cookie
 *      via the `set` handler on the shared response.
 *   3. We redirect to `next` (default: /dashboard). Middleware now sees the cookie
 *      and lets the request through.
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

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const msg = encodeURIComponent(error.message)
    return NextResponse.redirect(
      `${origin}/auth?error=exchange_failed&error_description=${msg}`
    )
  }

  return response
}
