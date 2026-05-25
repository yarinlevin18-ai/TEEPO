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
