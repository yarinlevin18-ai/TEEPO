-- Migration 001: Add missing columns to existing tables
-- Run this in Supabase SQL Editor after create_tables.sql has already been run

-- 1. Add category + duration to study_tasks
ALTER TABLE study_tasks ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'study';
ALTER TABLE study_tasks ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- 2. Add is_completed + completed_at to lessons
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 3. Rename assignment_tasks.completed → is_completed (if old name exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignment_tasks' AND column_name = 'completed'
  ) THEN
    ALTER TABLE assignment_tasks RENAME COLUMN completed TO is_completed;
  END IF;
END $$;

-- 4. Add semester + academic_year to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS semester TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS academic_year TEXT;

-- 5. Enable RLS on course_notes (may have been missed)
ALTER TABLE course_notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_course_notes') THEN
    CREATE POLICY service_all_course_notes ON course_notes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT 'Migration 001 completed successfully' AS result;
