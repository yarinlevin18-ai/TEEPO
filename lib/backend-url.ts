/**
 * Centralized backend URL resolver.
 *
 * Why this exists: in 2026-05-18 Render reassigned the bgu-study-backend
 * service to a new slug (-yr3r suffix) on a redeploy. The old URL
 * (bgu-study-backend.onrender.com, no suffix) was kept reserved on
 * Render's edge but no longer routes to any container — every request
 * returns `404` with `x-render-routing: no-server`.
 *
 * Updating Vercel's NEXT_PUBLIC_BACKEND_URL env var is the right fix,
 * but env-var changes need a manual deploy click on the dashboard. To
 * unblock callers immediately we intercept the known-dead URL here and
 * redirect it to the current live one. The redirect is a tiny, named
 * code path that's easy to delete once the Vercel env is updated.
 */

const DEAD_URL = 'https://bgu-study-backend.onrender.com'
const LIVE_URL = 'https://bgu-study-backend-yr3r.onrender.com'

/** Resolve the runtime backend URL for the Flask service. */
export function backendUrl(): string {
  const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').trim()
  // Empty / localhost fallback for dev — but in prod we want the live one.
  if (!env) {
    // SSR / build-time: prefer the live deployed URL so the build doesn't
    // bake "localhost:5000" into the bundle on Vercel.
    if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
      return LIVE_URL
    }
    return 'http://localhost:5000'
  }
  // Auto-redirect the known-dead suffix-less URL to the live -yr3r one.
  if (env.replace(/\/+$/, '') === DEAD_URL) {
    return LIVE_URL
  }
  return env.replace(/\/+$/, '')
}

/** Backwards-compat constant — same shape as the inlined consts the
 *  callers used to declare. Memoizes once at module load. */
export const BACKEND_URL = backendUrl()
