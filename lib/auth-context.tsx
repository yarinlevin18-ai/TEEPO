'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'
import { isDevAuthBypassEnabled, FAKE_USER, FAKE_SESSION } from './dev-auth-bypass'

const GOOGLE_TOKEN_KEY = 'smartdesk_google_token'
const GOOGLE_REFRESH_KEY = 'smartdesk_google_refresh_token'
const GOOGLE_EXPIRY_KEY = 'smartdesk_google_token_expires_at' // unix ms
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

// Refresh when less than this many ms remain before expiry. 5 minutes keeps
// us well clear of clock skew + API latency.
const REFRESH_MARGIN_MS = 5 * 60 * 1000

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  googleToken: string | null
  refreshGoogleToken: () => Promise<string | null>
  signInWithGoogle: () => Promise<{ error: string | null }>
  reconnectGoogle: () => Promise<void>
  clearGoogleToken: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function readExpiry(): number | null {
  try {
    const raw = localStorage.getItem(GOOGLE_EXPIRY_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeExpiry(expiresInSec: number | null | undefined) {
  if (!expiresInSec) {
    try { localStorage.removeItem(GOOGLE_EXPIRY_KEY) } catch {}
    return
  }
  try {
    localStorage.setItem(GOOGLE_EXPIRY_KEY, String(Date.now() + expiresInSec * 1000))
  } catch {}
}

// Ask Google for the REAL remaining lifetime of a provider_token.
// Supabase hands us the token without telling us when it expires, so without
// this we have to guess (usually 3600s) — and if the token is already mid-life
// or already dead, all Drive/Calendar calls silently start failing until the
// next scheduled refresh (which we set based on our wrong guess).
//
// Returns the real expires_in in seconds, or null if the token is invalid/expired
// or the endpoint is unreachable. Caller should treat null as "refresh now".
async function fetchGoogleTokenInfo(accessToken: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null // 400 = expired/invalid
    const data = await res.json()
    const n = Number(data?.expires_in)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleToken, setGoogleToken] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null)

  // Persist Google token to localStorage
  const persistGoogleToken = useCallback(
    (token: string | null, refreshToken?: string | null, expiresInSec?: number | null) => {
      if (token) {
        try { localStorage.setItem(GOOGLE_TOKEN_KEY, token) } catch {}
        setGoogleToken(token)
      }
      if (refreshToken) {
        try { localStorage.setItem(GOOGLE_REFRESH_KEY, refreshToken) } catch {}
      }
      if (expiresInSec !== undefined) writeExpiry(expiresInSec)
    },
    []
  )

  // Load stored Google token from localStorage
  const loadStoredGoogleToken = useCallback(() => {
    try {
      const stored = localStorage.getItem(GOOGLE_TOKEN_KEY)
      if (stored) setGoogleToken(stored)
      return stored
    } catch {
      return null
    }
  }, [])

  // Clear Google token (on expiry or sign-out)
  const clearGoogleToken = useCallback(() => {
    try {
      localStorage.removeItem(GOOGLE_TOKEN_KEY)
      localStorage.removeItem(GOOGLE_REFRESH_KEY)
      localStorage.removeItem(GOOGLE_EXPIRY_KEY)
    } catch {}
    setGoogleToken(null)
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  // Call our backend to exchange the refresh token for a fresh access token.
  // Supabase does NOT rotate the Google provider_token on refreshSession(),
  // so we talk to Google directly via the backend (which holds the client secret).
  const refreshViaBackend = useCallback(async (): Promise<string | null> => {
    let refreshToken: string | null = null
    try { refreshToken = localStorage.getItem(GOOGLE_REFRESH_KEY) } catch {}
    if (!refreshToken) return null

    try {
      const res = await fetch(`${BACKEND}/api/auth/refresh-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        // 401 = refresh token invalid/revoked → user must sign in again.
        if (res.status === 401) {
          // Keep the stored access token (may still have a few seconds left),
          // but drop the refresh token so callers know to force-reconnect.
          try { localStorage.removeItem(GOOGLE_REFRESH_KEY) } catch {}
        }
        return null
      }
      const data = await res.json()
      if (data?.access_token) {
        persistGoogleToken(data.access_token, refreshToken, data.expires_in)
        return data.access_token
      }
    } catch {
      // Network error / CORS / backend cold-start — caller will fall back.
    }
    return null
  }, [persistGoogleToken])

  // Public refresh: backend first, Supabase fallback. Dedupe concurrent callers.
  const refreshGoogleToken = useCallback(async (): Promise<string | null> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current
    const promise = (async () => {
      // 1. Preferred: backend → Google token endpoint
      const fromBackend = await refreshViaBackend()
      if (fromBackend) return fromBackend
      // 2. Fallback: ask Supabase to refresh the whole session
      try {
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data?.session?.provider_token) {
          // Supabase doesn't tell us expires_in for the provider token directly,
          // so ask Google. Fallback to 300s (forces quick re-refresh) if we can't.
          const realExpiry = await fetchGoogleTokenInfo(data.session.provider_token)
          persistGoogleToken(
            data.session.provider_token,
            data.session.provider_refresh_token ?? null,
            realExpiry ?? 300
          )
          return data.session.provider_token
        }
      } catch {}
      // 3. Nothing worked — return whatever we had stored.
      return loadStoredGoogleToken()
    })()
    refreshInFlightRef.current = promise
    try {
      return await promise
    } finally {
      refreshInFlightRef.current = null
    }
  }, [refreshViaBackend, persistGoogleToken, loadStoredGoogleToken])

  // Schedule the next proactive refresh so calls don't fail with 401.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
    const expiry = readExpiry()
    if (!expiry) return
    const delay = expiry - Date.now() - REFRESH_MARGIN_MS
    const safeDelay = Math.max(delay, 5_000) // never sooner than 5s
    refreshTimerRef.current = setTimeout(() => {
      refreshGoogleToken().then(() => scheduleRefresh())
    }, safeDelay)
  }, [refreshGoogleToken])

  useEffect(() => {
    // Dev-only bypass — short-circuit auth with a fake user. Never active in prod.
    // See lib/dev-auth-bypass.ts.
    if (isDevAuthBypassEnabled()) {
      setUser(FAKE_USER)
      setSession(FAKE_SESSION)
      setGoogleToken('dev-bypass-google-token')
      setLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.provider_token) {
        // We have a token — but it could be freshly-minted (just signed in) or
        // stale (returning user, Supabase still holds the old one). Ask Google
        // for the real remaining lifetime instead of guessing 3600s.
        const realExpiry = await fetchGoogleTokenInfo(session.provider_token)
        if (realExpiry === null) {
          // Token is already dead (or tokeninfo unreachable). Persist anyway so
          // callers have something to try, but mark as nearly-expired so the
          // proactive refresh timer fires immediately.
          persistGoogleToken(session.provider_token, session.provider_refresh_token ?? null, 60)
          // Kick off an immediate refresh so the next API call has a real token.
          await refreshGoogleToken()
        } else {
          persistGoogleToken(session.provider_token, session.provider_refresh_token ?? null, realExpiry)
        }
      } else if (session) {
        // Returning user — see if stored token is still fresh, else refresh.
        const stored = loadStoredGoogleToken()
        const expiry = readExpiry()
        const nearlyExpired = !expiry || Date.now() > expiry - REFRESH_MARGIN_MS
        if (!stored || nearlyExpired) {
          await refreshGoogleToken()
        }
      }

      scheduleRefresh()
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.provider_token) {
          // Fresh OAuth redirects generally hand us a 3600s-old token, but
          // TOKEN_REFRESHED events can fire with a provider_token that's already
          // mid-life or stale. Always verify with Google.
          const realExpiry = await fetchGoogleTokenInfo(session.provider_token)
          persistGoogleToken(
            session.provider_token,
            session.provider_refresh_token ?? null,
            realExpiry ?? 300
          )
          scheduleRefresh()
        }

        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    return { error: error?.message ?? null }
  }

  // Reconnect Google (clear expired token + re-auth).
  // `prompt=consent` forces Google to re-ask for scopes (needed when the
  // drive.file scope was added after the user's original consent).
  // `include_granted_scopes=true` keeps previously-granted scopes alongside
  // the new ones (incremental authorization).
  const reconnectGoogle = async () => {
    clearGoogleToken()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
        },
      },
    })
  }

  const signOut = async () => {
    clearGoogleToken()
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{
      user, session, loading, googleToken, refreshGoogleToken,
      signInWithGoogle, reconnectGoogle, clearGoogleToken, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
