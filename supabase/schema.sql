-- ============================================================
-- אפליקציית לימודים - סכמת בסיס הנתונים
-- הפעל ב-Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom_url',  -- 'udemy' | 'coursera' | 'custom_url'
  source_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  progress_percentage FLOAT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'paused' | 'completed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_course_url UNIQUE (user_id, source_url)
);

-- ============================================================
-- LESSONS (שיעורים / פרקים)
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  ai_summary TEXT,
  duration_minutes INT,
  order_index INT DEFAULT 0,
  is_completed BOOL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTES (הערות)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_summary TEXT,
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ASSIGNMENTS (מטלות)
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'todo',        -- 'todo' | 'in_progress' | 'submitted' | 'graded'
  priority TEXT NOT NULL DEFAULT 'medium',    -- 'low' | 'medium' | 'high'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ASSIGNMENT TASKS (פירוק משימה לצעדים)
-- ============================================================
CREATE TABLE IF NOT EXISTS assignment_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  is_completed BOOL DEFAULT FALSE,
  estimated_hours FLOAT,
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- STUDY TASKS (משימות לימוד יומיות)
-- ============================================================
CREATE TABLE IF NOT EXISTS study_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE,
  time_slot TIME,
  duration_minutes INT,
  category TEXT DEFAULT 'study',              -- 'study' | 'review' | 'practice' | 'project'
  is_completed BOOL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- QUIZZES (קוויזים)
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  total_questions INT DEFAULT 0,
  passing_score INT DEFAULT 70,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- QUIZ QUESTIONS (שאלות קוויז)
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice',
  options JSONB,                               -- [{"text": "...", "is_correct": false}, ...]
  explanation TEXT,
  order_index INT DEFAULT 0
);

-- ============================================================
-- QUIZ ATTEMPTS (ניסיונות קוויז)
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score INT,
  total_questions INT,
  time_spent_seconds INT,
  answers JSONB,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STUDY SESSIONS (מפגשי לימוד)
-- ============================================================
CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  notes TEXT,
  focus_areas TEXT[] DEFAULT '{}'
);

-- ============================================================
-- AGENT CONVERSATIONS (שיחות עם סוכנים)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_type TEXT DEFAULT 'study_buddy',
  messages JSONB DEFAULT '[]',
  context JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;

-- Courses: users see only their own
CREATE POLICY "courses_own" ON courses FOR ALL USING (auth.uid() = user_id);

-- Lessons: accessible if user owns the parent course
CREATE POLICY "lessons_own" ON lessons FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE courses.id = lessons.course_id AND courses.user_id = auth.uid()));

-- Notes
CREATE POLICY "notes_own" ON notes FOR ALL USING (auth.uid() = user_id);

-- Assignments
CREATE POLICY "assignments_own" ON assignments FOR ALL USING (auth.uid() = user_id);

-- Assignment tasks: accessible via assignment ownership
CREATE POLICY "assignment_tasks_own" ON assignment_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM assignments WHERE assignments.id = assignment_tasks.assignment_id AND assignments.user_id = auth.uid()));

-- Study tasks
CREATE POLICY "study_tasks_own" ON study_tasks FOR ALL USING (auth.uid() = user_id);

-- Quizzes
CREATE POLICY "quizzes_own" ON quizzes FOR ALL USING (auth.uid() = user_id);

-- Quiz questions: accessible via quiz ownership
CREATE POLICY "quiz_questions_own" ON quiz_questions FOR ALL
  USING (EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = quiz_questions.quiz_id AND quizzes.user_id = auth.uid()));

-- Quiz attempts
CREATE POLICY "quiz_attempts_own" ON quiz_attempts FOR ALL USING (auth.uid() = user_id);

-- Study sessions
CREATE POLICY "study_sessions_own" ON study_sessions FOR ALL USING (auth.uid() = user_id);

-- Agent conversations
CREATE POLICY "agent_conversations_own" ON agent_conversations FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_user_date ON study_tasks(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_convs_user ON agent_conversations(user_id, agent_type);


-- ============================================================
-- TEEPO Exam (spec §7.3)
-- ============================================================
-- TEEPO Exam — shared schema (§7.3)
-- All exam_* tables enforce RLS so members of a group can only see that group's data.

-- ===== exam_groups =====
CREATE TABLE exam_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  exam_id_ref TEXT NOT NULL,           -- references Drive DB
  course_id_ref TEXT NOT NULL,
  university TEXT NOT NULL CHECK (university IN ('BGU', 'TAU')),
  creator_user_id UUID NOT NULL REFERENCES auth.users(id),
  max_members INT NOT NULL DEFAULT 8 CHECK (max_members <= 25),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('created', 'active', 'archiving', 'archived', 'dissolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
ALTER TABLE exam_groups ENABLE ROW LEVEL SECURITY;

-- ===== exam_group_members =====
CREATE TABLE exam_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  role TEXT NOT NULL CHECK (role IN ('creator', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  UNIQUE (group_id, user_id)
);
ALTER TABLE exam_group_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_group_members_user ON exam_group_members(user_id);
CREATE INDEX idx_group_members_group ON exam_group_members(group_id);

-- ===== shared_notes =====
CREATE TABLE shared_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE CASCADE,
  sharer_user_id UUID NOT NULL REFERENCES auth.users(id),
  drive_file_id TEXT NOT NULL,
  file_title TEXT NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count INT NOT NULL DEFAULT 0
);
ALTER TABLE shared_notes ENABLE ROW LEVEL SECURITY;

-- ===== group_questions / answers =====
CREATE TABLE group_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE CASCADE,
  asker_user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  best_answer_id UUID
);
ALTER TABLE group_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE group_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES group_questions(id) ON DELETE CASCADE,
  answerer_user_id UUID REFERENCES auth.users(id),  -- nullable for AI answers
  content TEXT NOT NULL,
  votes INT NOT NULL DEFAULT 0,
  is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE group_answers ENABLE ROW LEVEL SECURITY;

-- ===== group_tasks =====
CREATE TABLE group_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  assignee_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE group_tasks ENABLE ROW LEVEL SECURITY;

-- ===== group_messages =====
CREATE TABLE group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_group_messages_group_time ON group_messages(group_id, created_at DESC);

-- ===== Helper: is current user a member of this group? =====
CREATE OR REPLACE FUNCTION is_group_member(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM exam_group_members
    WHERE group_id = _group_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- ===== Policies: members see group data only =====

CREATE POLICY exam_groups_select ON exam_groups FOR SELECT
  USING (is_group_member(id) OR creator_user_id = auth.uid() OR is_open = TRUE);

CREATE POLICY exam_groups_insert ON exam_groups FOR INSERT
  WITH CHECK (creator_user_id = auth.uid());

CREATE POLICY exam_groups_update ON exam_groups FOR UPDATE
  USING (creator_user_id = auth.uid());

CREATE POLICY members_select ON exam_group_members FOR SELECT
  USING (is_group_member(group_id) OR user_id = auth.uid());

CREATE POLICY members_insert ON exam_group_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY members_update_self ON exam_group_members FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY notes_select ON shared_notes FOR SELECT
  USING (is_group_member(group_id));
CREATE POLICY notes_insert ON shared_notes FOR INSERT
  WITH CHECK (is_group_member(group_id) AND sharer_user_id = auth.uid());
CREATE POLICY notes_delete_own ON shared_notes FOR DELETE
  USING (sharer_user_id = auth.uid());

CREATE POLICY questions_select ON group_questions FOR SELECT
  USING (is_group_member(group_id));
CREATE POLICY questions_insert ON group_questions FOR INSERT
  WITH CHECK (is_group_member(group_id) AND asker_user_id = auth.uid());

CREATE POLICY answers_select ON group_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM group_questions q
    WHERE q.id = group_answers.question_id AND is_group_member(q.group_id)
  ));
CREATE POLICY answers_insert ON group_answers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM group_questions q
    WHERE q.id = group_answers.question_id AND is_group_member(q.group_id)
  ));

CREATE POLICY tasks_select ON group_tasks FOR SELECT
  USING (is_group_member(group_id));
CREATE POLICY tasks_insert ON group_tasks FOR INSERT
  WITH CHECK (is_group_member(group_id) AND creator_id = auth.uid());
CREATE POLICY tasks_update ON group_tasks FOR UPDATE
  USING (is_group_member(group_id));

CREATE POLICY messages_select ON group_messages FOR SELECT
  USING (is_group_member(group_id));
CREATE POLICY messages_insert ON group_messages FOR INSERT
  WITH CHECK (is_group_member(group_id) AND sender_id = auth.uid());

-- ===== Auto-archive cron job (run nightly) =====
-- Archives groups whose related exam was 7+ days ago.
CREATE OR REPLACE FUNCTION archive_old_groups()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE exam_groups
     SET status = 'archived', archived_at = now()
   WHERE status = 'active'
     AND created_at < now() - INTERVAL '60 days';
  -- Real implementation: join against Drive DB exam.date instead of created_at.
END;
$$;
