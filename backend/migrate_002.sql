-- Migration 002: Lesson notebook fields + per-lesson tasks
-- Run after migrate_001.sql. Idempotent — safe to re-run.

-- 1. Lesson notebook enrichment
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS files      JSONB  DEFAULT '[]'::jsonb;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS recap      TEXT;

-- 2. Scope tasks to a lesson (nullable — course-level tasks stay unchanged)
ALTER TABLE study_tasks ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE study_tasks ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL;
ALTER TABLE study_tasks ADD COLUMN IF NOT EXISTS time_slot TEXT;

CREATE INDEX IF NOT EXISTS idx_study_tasks_lesson ON study_tasks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_course ON study_tasks(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course     ON lessons(course_id);

SELECT 'Migration 002 completed successfully' AS result;
