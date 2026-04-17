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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>
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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      // Persist Google token if available on session (right after OAuth)
      if (session?.provider_token) {
        persistGoogleToken(session.provider_token, session.provider_refresh_token)
      } else {
        // Fall back to localStorage
        loadStoredGoogleToken()
      }

      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        // When provider_token is available (right after OAuth), persist it
        if (session?.provider_token) {
          persistGoogleToken(session.provider_token, session.provider_refresh_token)
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [persistGoogleToken, loadStoredGoogleToken])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: displayName ? { data: { display_name: displayName } } : undefined,
    })
    return { error: error?.message ?? null }
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    return { error: error?.message ?? null }
  }

  // Reconnect Google (clear expired token + re-auth)
  const reconnectGoogle = async () => {
    clearGoogleToken()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
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
      user, session, loading, googleToken,
      signIn, signUp, signInWithGoogle, reconnectGoogle, clearGoogleToken, signOut,
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
