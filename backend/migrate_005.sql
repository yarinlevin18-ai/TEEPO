-- Migration 005: courses.last_synced_at
--
-- Adds a per-course "last successful sync" timestamp used as the diff
-- cutoff by POST /api/sync/all. When a sync run finishes scraping a
-- course without errors, we update this field; the next run filters
-- scraper output to "created_at > last_synced_at" so the user only
-- sees what's new since they last looked.
--
-- The current production storage path for courses is Drive's db.json
-- (the supabase courses table is sparsely populated, holdover from
-- pre-Drive-DB days). This column is added here for forward-compat —
-- when the courses table becomes primary again, the value lives in
-- the right place. In the interim, the frontend also mirrors the
-- same timestamp to its db.json course record so reads work without
-- a Supabase round-trip.
--
-- Idempotent — safe to re-run.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Partial index for "courses that have never been synced" — sync-all
-- prioritizes those over already-synced courses to give new content
-- the fastest path to surfacing. Keep the index tiny by only
-- including the never-synced rows.
CREATE INDEX IF NOT EXISTS idx_courses_never_synced
  ON courses(user_id)
  WHERE last_synced_at IS NULL;

SELECT 'Migration 005 completed successfully' AS result;
