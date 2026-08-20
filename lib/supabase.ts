import { createBrowserClient } from '@supabase/ssr'

// Fall back to a placeholder during builds without env vars (e.g. CI
// prerendering) — real values are required at runtime for auth to work.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
