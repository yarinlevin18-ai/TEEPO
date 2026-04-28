-- Migration 004: catalog tables become multi-university
--
-- The catalog tables (departments / tracks / course_catalog) were created
-- BGU-only — table names are prefixed with bgu_ and there's no field
-- distinguishing schools. To support TAU we need each row scoped by
-- university. Approach taken here is the smallest one that keeps existing
-- code working:
--
--   1. Add a `university` column to each catalog table, defaulting to 'bgu'
--      so existing rows are correctly classified.
--   2. Make uniqueness constraints university-aware where they exist
--      (course_id was global; (course_id, university) is what we want).
--   3. Add per-university indexes so reads can filter cheaply.
--
-- Table names are intentionally NOT renamed in this migration. routes/catalog.py
-- still reads bgu_* names. A follow-up PR can rename to university_* once the
-- read side passes the active university through to the query.
--
-- TAU rows themselves are NOT seeded here — that's an ETL step against the
-- TAU catalog publication, out of scope for the schema migration. The schema
-- additions below let TAU rows land cleanly when that data arrives.
--
-- Idempotent — safe to re-run.

-- 1. Add `university` column to each catalog table.
ALTER TABLE bgu_departments ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT 'bgu';
ALTER TABLE bgu_tracks      ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT 'bgu';
ALTER TABLE bgu_course_catalog ADD COLUMN IF NOT EXISTS university TEXT NOT NULL DEFAULT 'bgu';

-- 2. Lock the vocabulary so a typo can't create a phantom 'b_g_u' partition.
ALTER TABLE bgu_departments    DROP CONSTRAINT IF EXISTS bgu_departments_university_check;
ALTER TABLE bgu_departments    ADD CONSTRAINT bgu_departments_university_check
  CHECK (university IN ('bgu', 'tau'));
ALTER TABLE bgu_tracks         DROP CONSTRAINT IF EXISTS bgu_tracks_university_check;
ALTER TABLE bgu_tracks         ADD CONSTRAINT bgu_tracks_university_check
  CHECK (university IN ('bgu', 'tau'));
ALTER TABLE bgu_course_catalog DROP CONSTRAINT IF EXISTS bgu_course_catalog_university_check;
ALTER TABLE bgu_course_catalog ADD CONSTRAINT bgu_course_catalog_university_check
  CHECK (university IN ('bgu', 'tau'));

-- 3. Course IDs collide between schools (e.g. each runs a "calculus 1" with
--    a local code). Drop the global PK on course_id and use (course_id,
--    university) — same shape as the unique-by-component change in
--    migrate_003.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bgu_course_catalog_pkey'
  ) THEN
    ALTER TABLE bgu_course_catalog DROP CONSTRAINT bgu_course_catalog_pkey;
    ALTER TABLE bgu_course_catalog
      ADD CONSTRAINT bgu_course_catalog_pkey
      PRIMARY KEY (course_id, university);
  END IF;
END $$;

-- 4. Same for departments and tracks. Track IDs are also school-local.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bgu_departments_pkey'
  ) THEN
    ALTER TABLE bgu_departments DROP CONSTRAINT bgu_departments_pkey;
    ALTER TABLE bgu_departments
      ADD CONSTRAINT bgu_departments_pkey
      PRIMARY KEY (id, university);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bgu_tracks_pkey'
  ) THEN
    ALTER TABLE bgu_tracks DROP CONSTRAINT bgu_tracks_pkey;
    ALTER TABLE bgu_tracks
      ADD CONSTRAINT bgu_tracks_pkey
      PRIMARY KEY (id, university);
  END IF;
END $$;

-- 5. Existing FK from bgu_course_catalog.department -> bgu_departments(id)
--    no longer matches the composite PK. Drop it; the column stays so the
--    join still works against (department, university). Re-adding a proper
--    composite FK is a follow-up once the read code is university-aware.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bgu_course_catalog_department_fkey'
  ) THEN
    ALTER TABLE bgu_course_catalog DROP CONSTRAINT bgu_course_catalog_department_fkey;
  END IF;
END $$;

-- Same for student_profile.track_id, which referenced bgu_tracks(id) PK.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_profile_track_id_fkey'
  ) THEN
    ALTER TABLE student_profile DROP CONSTRAINT student_profile_track_id_fkey;
  END IF;
END $$;

-- 6. Indexes for the new filter dimension. Reads will mostly be
--    "give me everything for university=$1", so a leading-column index pays.
CREATE INDEX IF NOT EXISTS idx_bgu_departments_university    ON bgu_departments(university);
CREATE INDEX IF NOT EXISTS idx_bgu_tracks_university         ON bgu_tracks(university);
CREATE INDEX IF NOT EXISTS idx_bgu_course_catalog_university ON bgu_course_catalog(university);

SELECT 'Migration 004 completed successfully' AS result;
