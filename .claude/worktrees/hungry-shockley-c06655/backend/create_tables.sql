-- SmartDesk - Full Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard -> SQL Editor -> New query

-- ── BGU Sessions (cookie persistence across restarts) ──────────────────────
CREATE TABLE IF NOT EXISTS bgu_sessions (
  site        TEXT PRIMARY KEY,
  cookies     TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Courses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  title               TEXT NOT NULL,
  source              TEXT DEFAULT 'bgu',
  source_url          TEXT,
  description         TEXT,
  status              TEXT DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0,
  thumbnail_url       TEXT,
  semester            TEXT,
  academic_year       TEXT,
  lecturer_email      TEXT,
  syllabus_url        TEXT,
  teaching_assistants JSONB DEFAULT '[]'::jsonb,
  course_links        JSONB DEFAULT '[]'::jsonb,
  portal_metadata     JSONB DEFAULT '{}'::jsonb,
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
  is_completed     BOOLEAN DEFAULT false,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Study Tasks ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  scheduled_date DATE,
  is_completed   BOOLEAN DEFAULT false,
  priority       TEXT DEFAULT 'medium',
  category       TEXT DEFAULT 'study',
  duration_minutes INTEGER,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Assignments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'todo',
  priority    TEXT DEFAULT 'medium',
  deadline    DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Assignment Tasks (subtasks for assignments) ────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID REFERENCES assignments(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  is_completed    BOOLEAN DEFAULT false,
  order_index     INTEGER DEFAULT 0,
  estimated_hours NUMERIC DEFAULT 1
);

-- ── Quizzes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
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
  user_id    TEXT NOT NULL,
  score      NUMERIC DEFAULT 0,
  answers    JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Study Sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  lesson_id        UUID REFERENCES lessons(id) ON DELETE SET NULL,
  duration_minutes INTEGER DEFAULT 0,
  started_at       TIMESTAMPTZ DEFAULT now(),
  ended_at         TIMESTAMPTZ
);

-- ── Agent Conversations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  agent_type      TEXT DEFAULT 'study_buddy',
  messages        JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now()
);

-- ── Course Notes (user-written summaries & uploaded file summaries) ──────────
CREATE TABLE IF NOT EXISTS course_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  note_type   TEXT DEFAULT 'manual',       -- 'manual' | 'file_upload' | 'ai_generated'
  file_name   TEXT,                         -- original uploaded file name
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Student Grades (persisted from Moodle + Portal) ────────────────────────
CREATE TABLE IF NOT EXISTS student_grades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  course_name     TEXT NOT NULL,
  course_moodle_id TEXT,
  grade           NUMERIC,
  grade_text      TEXT,
  semester        TEXT,
  academic_year   TEXT,
  source          TEXT DEFAULT 'moodle' CHECK (source IN ('moodle', 'portal', 'manual')),
  component       TEXT,
  rank            TEXT,
  credits         NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Prevent duplicates: same user + course + semester + component
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_grades_unique
  ON student_grades(user_id, course_name, COALESCE(semester, ''), COALESCE(component, ''));

-- ── Degree Settings (user's degree program info) ───────────────────────────
CREATE TABLE IF NOT EXISTS degree_settings (
  user_id               TEXT PRIMARY KEY,
  degree_name           TEXT,
  total_credits_required NUMERIC DEFAULT 160,
  start_year            INTEGER,
  expected_end_year     INTEGER,
  total_semesters       INTEGER DEFAULT 8,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes for performance ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_user ON study_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_date ON study_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_deadline ON assignments(deadline);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user ON agent_conversations(user_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_course_notes_course ON course_notes(course_id);
CREATE INDEX IF NOT EXISTS idx_course_notes_user ON course_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_user ON student_grades(user_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_year ON student_grades(academic_year);

-- ── RLS Policies ────────────────────────────────────────────────────────────
-- Enable RLS on all tables (service_role bypasses RLS automatically)
ALTER TABLE bgu_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE degree_settings ENABLE ROW LEVEL SECURITY;

-- Service role policy (backend uses service role key, so it bypasses RLS)
-- But add explicit policies for anon/authenticated access if needed later
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_bgu_sessions') THEN
    CREATE POLICY service_all_bgu_sessions ON bgu_sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_courses') THEN
    CREATE POLICY service_all_courses ON courses FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_lessons') THEN
    CREATE POLICY service_all_lessons ON lessons FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_study_tasks') THEN
    CREATE POLICY service_all_study_tasks ON study_tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_assignments') THEN
    CREATE POLICY service_all_assignments ON assignments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_assignment_tasks') THEN
    CREATE POLICY service_all_assignment_tasks ON assignment_tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_quizzes') THEN
    CREATE POLICY service_all_quizzes ON quizzes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_quiz_questions') THEN
    CREATE POLICY service_all_quiz_questions ON quiz_questions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_quiz_attempts') THEN
    CREATE POLICY service_all_quiz_attempts ON quiz_attempts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_study_sessions') THEN
    CREATE POLICY service_all_study_sessions ON study_sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_agent_conversations') THEN
    CREATE POLICY service_all_agent_conversations ON agent_conversations FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_course_notes') THEN
    CREATE POLICY service_all_course_notes ON course_notes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_student_grades') THEN
    CREATE POLICY service_all_student_grades ON student_grades FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_degree_settings') THEN
    CREATE POLICY service_all_degree_settings ON degree_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Confirmation
SELECT 'All tables, indexes, and RLS policies created successfully' AS result;
