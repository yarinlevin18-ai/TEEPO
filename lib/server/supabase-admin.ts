/**
 * Service-role Supabase access for API routes. Server-only.
 *
 * Required env (Vercel, server-side — NOT NEXT_PUBLIC_):
 *   SUPABASE_SERVICE_KEY — the service-role key (bypasses RLS; this is
 *   how the RLS-locked user_google_tokens table is reached).
 * Reuses NEXT_PUBLIC_SUPABASE_URL for the project URL.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim()
  if (!url || !serviceKey) return null
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}

/**
 * Resolve a Supabase access token (JWT) to its user id, or null when the
 * token is missing/invalid/expired.
 */
export async function userIdFromJWT(jwt: string | null | undefined): Promise<string | null> {
  if (!jwt) return null
  const admin = supabaseAdmin()
  if (!admin) return null
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user?.id) return null
  return data.user.id
}
