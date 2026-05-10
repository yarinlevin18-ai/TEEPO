-- Migration 005: server-side encrypted Google refresh-token storage
--
-- WHY
-- ===
-- Until now the Google `provider_refresh_token` lived only in the user's
-- browser localStorage. That makes "fresh device" / "private window" a
-- broken experience: the refresh token isn't there, the access token has
-- already expired, and the user gets bounced back through Google OAuth.
--
-- This table stores the refresh token encrypted at rest, keyed by user_id.
-- The plaintext NEVER lands in Postgres — services/token_crypto.py wraps
-- it in AES-256-GCM (key derived from FLASK_SECRET_KEY via HKDF) before
-- the row is written, and unwraps it after reading.
--
-- SECURITY NOTES
-- ==============
-- 1. RLS is enabled with NO policies for the `authenticated` role. That
--    means a leaked anon/JWT key cannot read this table at all — only the
--    backend's service-role key (used in services/supabase_client.py) can.
--    Users cannot read their own ciphertext, by design.
--
-- 2. Rotating FLASK_SECRET_KEY invalidates every stored token. Worst case
--    every user re-OAuths once. Acceptable trade-off vs. storing a key
--    rotation lookup table.
--
-- 3. Each row carries its own 12-byte IV (base64'd in the iv column).
--    Re-encrypting the same plaintext produces a different ciphertext, so
--    we never leak that two users share a refresh token (they shouldn't).
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS user_google_tokens (
  user_id    UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext TEXT         NOT NULL,
  iv         TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for `authenticated` or `anon`.
-- This table is reachable only via the service-role key. We drop any
-- policies that may have been created by mistake on a previous run.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'user_google_tokens'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_google_tokens', pol.polname);
  END LOOP;
END $$;

-- Auto-bump updated_at on UPDATE so we can monitor token-rotation health.
CREATE OR REPLACE FUNCTION user_google_tokens_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_google_tokens_updated_at ON user_google_tokens;
CREATE TRIGGER user_google_tokens_updated_at
  BEFORE UPDATE ON user_google_tokens
  FOR EACH ROW
  EXECUTE FUNCTION user_google_tokens_set_updated_at();

SELECT 'Migration 005 completed successfully' AS result;
