-- BGU Study Organizer - Full Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor → New query

-- ── BGU Sessions (cookie persistence across restarts) ──────────────────────
CREATE TABLE IF NOT EXISTS bgu_sessions (
  site        TEXT PRIMARY KEY,
  cookies     TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Courses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL DEFAULT 'dev-user',
  title               TEXT NOT NULL,
  source              TEXT DEFAULT 'bgu',
  source_url          TEXT,
  description         TEXT,
  status              TEXT DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0,
  thumbnail_url       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ── Lessons ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  content          TEXT,
  ai_summary       TEXT,
  order_index      INTEGER DEFAULT 0,
  duration_minutes INTEGER DEFAULT 0,
  lesson_url       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Study Tasks ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL DEFAULT 'dev-user',
  title          TEXT NOT NULL,
  description    TEXT,
  scheduled_date DATE,
  is_completed   BOOLEAN DEFAULT false,
  priority       TEXT DEFAULT 'medium',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Assignments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL DEFAULT 'dev-user',
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'todo',
  priority    TEXT DEFAULT 'medium',
  due_date    DATE,
  deadline    DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Assignment Tasks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  completed     BOOLEAN DEFAULT false,
  order_index   INTEGER DEFAULT 0
);

-- ── Quizzes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL DEFAULT 'dev-user',
  lesson_id  UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Quiz Questions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  options       JSONB NOT NULL DEFAULT '[]',
  correct_index INTEGER DEFAULT 0,
  explanation   TEXT
);

-- ── Quiz Attempts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id    UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL DEFAULT 'dev-user',
  score      NUMERIC DEFAULT 0,
  answers    JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Study Sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL DEFAULT 'dev-user',
  lesson_id        UUID REFERENCES lessons(id) ON DELETE SET NULL,
  duration_minutes INTEGER DEFAULT 0,
  started_at       TIMESTAMPTZ DEFAULT now(),
  ended_at         TIMESTAMPTZ
);

-- ── Agent Conversations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL DEFAULT 'dev-user',
  agent_type      TEXT DEFAULT 'study_buddy',
  messages        JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now()
);

-- Confirmation
SELECT 'Tables created successfully' AS result;
