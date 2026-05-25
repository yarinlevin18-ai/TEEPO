-- Migration 003: v2.1 course enrichment + manual grade entry
-- Run after migrate_002.sql. Idempotent — safe to re-run.

-- 1. Course enrichment fields (lecturer, syllabus, TAs, links, portal-specific metadata)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS lecturer_email      TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS syllabus_url        TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS teaching_assistants JSONB DEFAULT '[]'::jsonb;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_links        JSONB DEFAULT '[]'::jsonb;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS portal_metadata     JSONB DEFAULT '{}'::jsonb;

-- 2. Grade source: allow 'manual' (alongside existing 'moodle' / 'portal')
--    `source` is already TEXT with default 'moodle' — no type change needed.
--    Add a CHECK constraint to lock the vocabulary. Drop first so re-runs stay clean.
ALTER TABLE student_grades DROP CONSTRAINT IF EXISTS student_grades_source_check;
ALTER TABLE student_grades
  ADD CONSTRAINT student_grades_source_check
  CHECK (source IN ('moodle', 'portal', 'manual'));

-- 3. Grade component (e.g. 'midterm', 'final', 'assignment_1') — partial grades for course average
ALTER TABLE student_grades ADD COLUMN IF NOT EXISTS component TEXT;

-- 4. updated_at on student_grades (defensive — exists in create_tables.sql but not guaranteed in prod)
ALTER TABLE student_grades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 5. Allow multiple components per course/semester (relax the unique index to include component)
DROP INDEX IF EXISTS idx_student_grades_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_grades_unique
  ON student_grades(user_id, course_name, COALESCE(semester, ''), COALESCE(component, ''));

SELECT 'Migration 003 completed successfully' AS result;
