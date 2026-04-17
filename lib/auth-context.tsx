'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

const GOOGLE_TOKEN_KEY = 'smartdesk_google_token'
const GOOGLE_REFRESH_KEY = 'smartdesk_google_refresh_token'

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleToken, setGoogleToken] = useState<string | null>(null)

  // Persist Google token to localStorage
  const persistGoogleToken = useCallback((token: string | null, refreshToken?: string | null) => {
    if (token) {
      try { localStorage.setItem(GOOGLE_TOKEN_KEY, token) } catch {}
      setGoogleToken(token)
    }
    if (refreshToken) {
      try { localStorage.setItem(GOOGLE_REFRESH_KEY, refreshToken) } catch {}
    }
  }, [])

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
    } catch {}
    setGoogleToken(null)
  }, [])

  // Ask Supabase to refresh the session (which also refreshes the Google provider token)
  const refreshGoogleToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data?.session?.provider_token) {
        persistGoogleToken(data.session.provider_token, data.session.provider_refresh_token)
        return data.session.provider_token
      }
    } catch {}
    // Supabase refresh didn't give us a provider token — return whatever is stored
    return loadStoredGoogleToken()
  }, [persistGoogleToken, loadStoredGoogleToken])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.provider_token) {
        // Right after OAuth redirect — fresh token on the session
        persistGoogleToken(session.provider_token, session.provider_refresh_token)
      } else if (session) {
        // Returning user — session exists but no provider token.
        // Ask Supabase to refresh (it will refresh the Google token too if it has a refresh_token).
        try {
          const { data } = await supabase.auth.refreshSession()
          if (data?.session?.provider_token) {
            persistGoogleToken(data.session.provider_token, data.session.provider_refresh_token)
          } else {
            // Supabase couldn't refresh provider token — fall back to localStorage
            loadStoredGoogleToken()
          }
        } catch {
          loadStoredGoogleToken()
        }
      }

      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.provider_token) {
          persistGoogleToken(session.provider_token, session.provider_refresh_token)
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [persistGoogleToken, loadStoredGoogleToken])

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
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
        redirectTo: `${window.location.origin}/dashboard`,
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
