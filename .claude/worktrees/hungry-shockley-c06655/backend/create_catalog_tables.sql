-- ══════════════════════════════════════════════════════════════════
-- BGU Course Catalog & Student Academic Profile
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════════

-- ── Departments ──────────────────────────────────────────────────
-- Composite PK (id, university): course IDs are school-local.
CREATE TABLE IF NOT EXISTS bgu_departments (
  id            TEXT NOT NULL,
  university    TEXT NOT NULL DEFAULT 'bgu' CHECK (university IN ('bgu', 'tau')),
  name          TEXT NOT NULL,
  faculty       TEXT,
  program_code  TEXT,
  PRIMARY KEY (id, university)
);

-- ── Study Tracks (מסלולים) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bgu_tracks (
  id             TEXT NOT NULL,
  university     TEXT NOT NULL DEFAULT 'bgu' CHECK (university IN ('bgu', 'tau')),
  name           TEXT NOT NULL,
  departments    TEXT[] NOT NULL,
  total_credits  NUMERIC NOT NULL,
  type           TEXT DEFAULT 'single',  -- single / dual / minor
  details        JSONB DEFAULT '{}',
  PRIMARY KEY (id, university)
);

-- ── Course Catalog ───────────────────────────────────────────────
-- FK to bgu_departments was dropped in migrate_004 — composite PK upstream
-- means we'd need a composite FK and the read code isn't university-aware
-- yet. Bring it back when routes/catalog.py filters by university.
CREATE TABLE IF NOT EXISTS bgu_course_catalog (
  course_id      TEXT NOT NULL,
  university     TEXT NOT NULL DEFAULT 'bgu' CHECK (university IN ('bgu', 'tau')),
  name           TEXT NOT NULL,
  name_en        TEXT,
  credits        NUMERIC NOT NULL,
  department     TEXT,
  year           INTEGER,
  semester       TEXT,
  type           TEXT DEFAULT 'elective',  -- mandatory / elective
  tracks         TEXT[] DEFAULT '{}',
  prerequisites  TEXT[] DEFAULT '{}',
  category       TEXT,  -- cs_mandatory, math_mandatory, etc.
  PRIMARY KEY (course_id, university)
);

CREATE INDEX IF NOT EXISTS idx_catalog_dept ON bgu_course_catalog(department);
CREATE INDEX IF NOT EXISTS idx_catalog_name ON bgu_course_catalog USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_catalog_tracks ON bgu_course_catalog USING gin(tracks);
CREATE INDEX IF NOT EXISTS idx_bgu_departments_university    ON bgu_departments(university);
CREATE INDEX IF NOT EXISTS idx_bgu_tracks_university         ON bgu_tracks(university);
CREATE INDEX IF NOT EXISTS idx_bgu_course_catalog_university ON bgu_course_catalog(university);

-- ── Student Academic Profile ─────────────────────────────────────
-- Replaces the old degree_settings — now tracks what the student studies.
-- track_id no longer FKs (composite PK upstream); pair (track_id, university)
-- is what identifies a track. The university comes from user_settings.
CREATE TABLE IF NOT EXISTS student_profile (
  user_id        TEXT PRIMARY KEY,
  track_id       TEXT,
  start_year     INTEGER,
  current_year   INTEGER DEFAULT 1,
  expected_end   INTEGER,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Student Courses (which courses the student took/is taking) ───
CREATE TABLE IF NOT EXISTS student_courses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  course_id      TEXT NOT NULL,
  course_name    TEXT NOT NULL,
  credits        NUMERIC NOT NULL,
  status         TEXT DEFAULT 'completed', -- completed / in_progress / planned
  grade          NUMERIC,
  semester       TEXT,
  academic_year  TEXT,
  source         TEXT DEFAULT 'manual',    -- manual / moodle / catalog
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_courses_unique
  ON student_courses(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_student_courses_user ON student_courses(user_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE bgu_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bgu_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bgu_course_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_courses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_departments') THEN
    CREATE POLICY public_read_departments ON bgu_departments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_tracks') THEN
    CREATE POLICY public_read_tracks ON bgu_tracks FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_catalog') THEN
    CREATE POLICY public_read_catalog ON bgu_course_catalog FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_departments') THEN
    CREATE POLICY service_all_departments ON bgu_departments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_tracks') THEN
    CREATE POLICY service_all_tracks ON bgu_tracks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_catalog') THEN
    CREATE POLICY service_all_catalog ON bgu_course_catalog FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_student_profile') THEN
    CREATE POLICY service_all_student_profile ON student_profile FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_student_courses') THEN
    CREATE POLICY service_all_student_courses ON student_courses FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT 'Catalog tables created successfully' AS result;
