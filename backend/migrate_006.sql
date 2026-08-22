-- Migration 006: user_google_tokens
--
-- Encrypted at-rest storage for Google OAuth refresh tokens, so any
-- device with a valid Supabase session can refresh its Google access
-- token without re-running the OAuth consent flow (previously the
-- refresh token lived only in one browser's localStorage).
--
-- The ciphertext is AES-256-GCM, encrypted server-side on Vercel with a
-- key derived (HKDF-SHA256) from TOKEN_ENCRYPTION_SECRET — the database
-- never sees plaintext. See lib/server/token-crypto.ts.
--
-- RLS is ENABLED with NO policies on purpose: only the service-role key
-- (used by the Vercel API routes) can touch this table. Client-side
-- Supabase queries are denied entirely.

CREATE TABLE IF NOT EXISTS user_google_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION set_user_google_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_google_tokens_updated_at ON user_google_tokens;
CREATE TRIGGER trg_user_google_tokens_updated_at
  BEFORE UPDATE ON user_google_tokens
  FOR EACH ROW EXECUTE FUNCTION set_user_google_tokens_updated_at();
