import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Dev-only bypass: when NEXT_PUBLIC_DEV_BYPASS_AUTH=true and not in production,
// /dashboard/* is reachable without a real session. The flag is read here
// (Edge runtime) directly from env to avoid pulling in client modules.
const DEV_AUTH_BYPASS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

/**
 * Auth gate for /dashboard/*.
 * - Unauthenticated users are redirected to /auth with ?next=<path>.
 * - We also add a tiny defense-in-depth header set here, though the primary
 *   security headers come from next.config.js.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only guard protected surfaces
  const needsAuth = pathname.startsWith('/dashboard')
  if (!needsAuth) return NextResponse.next()

  // Dev-only bypass — see lib/dev-auth-bypass.ts. Never active in prod.
  if (DEV_AUTH_BYPASS) return NextResponse.next()

  const response = NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fail-open to /auth if envs are missing (prevents crash, keeps gate closed)
  if (!supabaseUrl || !supabaseAnonKey) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

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

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
