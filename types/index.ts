// ============================================================
// טיפוסי TypeScript לאפליקציית הלימודים
// ============================================================

/** Universities supported in v2.1. More are roadmapped for Phase 3. */
export type UniversityCode = 'bgu' | 'tau'

/** Per-user app settings stored inside the Drive DB */
export interface UserSettings {
  /** Which university's catalog + scrapers to use. Set during onboarding. */
  university?: UniversityCode
  /** Light/dark mode preference. Mirrors the `smartdesk_theme` localStorage key. */
  theme?: 'light' | 'dark'
  /** Gregorian year the user started their degree (e.g. 2023) */
  degree_start_year?: number
  /** Month (1-12) the user started — normally 10 (October). Used to align year-of-study boundaries. */
  degree_start_month?: number
  /** True if the user does summer semesters (shows קיץ slots even if empty) */
  takes_summer?: boolean
}

/**
 * Teaching assistant attached to a course. Pulled from Moodle/Portal where
 * available; user-editable when not.
 */
export interface TeachingAssistant {
  name: string
  email?: string
  /** e.g. "מתרגל", "מתרגלת ראשית" — free-form, comes from the source. */
  role?: string
  /** Free-text — "ראשון 14:00–16:00, חדר 304". Optional. */
  office_hours?: string
}

/** Generic external link attached to a course (syllabus is its own field). */
export interface CourseLink {
  label: string
  url: string
}

export interface Course {
  id: string
  user_id: string
  title: string
  source: 'bgu' | 'udemy' | 'coursera' | 'custom_url'
  source_url?: string
  thumbnail_url?: string
  description?: string
  progress_percentage: number
  status: 'active' | 'paused' | 'completed'
  started_at?: string
  completed_at?: string
  created_at: string
  semester?: 'א' | 'ב' | 'קיץ'
  /** Gregorian year the academic year starts in (e.g. "2024" for תשפ"ה = Oct 2024–Sep 2025) */
  academic_year?: string
  /** Year of study relative to the user's degree (1=א, 2=ב, 3=ג, 4=ד). Computed from academic_year + degree start. */
  year_of_study?: 1 | 2 | 3 | 4
  /** Raw Moodle metadata kept so we can re-classify on demand */
  moodle_startdate?: number   // UNIX timestamp seconds
  moodle_enddate?: number     // UNIX timestamp seconds
  shortname?: string          // BGU short code, e.g. "201-1-3301-24"
  category_name?: string      // Moodle category (department/semester grouping)
  /** True if the user manually overrode semester/year — skip auto-reclassification */
  classified_manually?: boolean
  /** Google Drive folder IDs for this course's user-facing files (lazily populated). */
  drive_folder_ids?: {
    course: string
    lessons: string
    assignments: string
    notes: string
  }
  /** The classification (year+semester) we used last time we created/verified the Drive folders.
   *  If this drifts from current year_of_study+semester, the folder is stale and may need to move. */
  drive_folder_path?: string

  // ── v2.1 fields ────────────────────────────────────────────────
  /** Lecturer's email — typically pulled from Moodle/Portal, sometimes user-supplied. */
  lecturer_email?: string
  /** URL to the official syllabus PDF (Moodle resource or external). */
  syllabus_url?: string
  /** TAs assigned to the course. Empty array = none known yet. */
  teaching_assistants?: TeachingAssistant[]
  /** Free-form links the lecturer/TA shared (lab guides, recorded lectures, etc). */
  course_links?: CourseLink[]
  /** Opaque snapshot from the university Portal scraper. Schema is per-university;
   *  the frontend treats it as read-only and just surfaces specific keys. */
  portal_metadata?: Record<string, unknown>
}

export interface LessonFile {
  name: string
  url: string
  type: 'pdf' | 'pptx' | 'doc' | 'image' | 'link' | 'gdrive' | 'other'
}

export interface Lesson {
  id: string
  course_id: string
  title: string
  content?: string
  ai_summary?: string
  /** Raw Whisper transcript of a class recording. Stored as plain text. */
  transcript?: string
  /** Short AI recap of this lesson to greet the user when they open the next chapter. */
  recap?: string
  duration_minutes?: number
  order_index: number
  is_completed: boolean
  completed_at?: string
  files?: LessonFile[]
}

export interface StudyTask {
  id: string
  user_id: string
  course_id?: string
  /** Optional per-lesson scoping — set when the task was created inside the lesson notebook. */
  lesson_id?: string
  title: string
  description?: string
  scheduled_date?: string
  time_slot?: string
  duration_minutes?: number
  category: 'study' | 'review' | 'practice' | 'project'
  is_completed: boolean
  completed_at?: string
  created_at: string
}

export interface Assignment {
  id: string
  user_id: string
  course_id?: string
  title: string
  description?: string
  deadline?: string
  status: 'todo' | 'in_progress' | 'submitted' | 'graded'
  priority: 'low' | 'medium' | 'high'
  assignment_tasks?: AssignmentTask[]
}

export interface AssignmentTask {
  id: string
  assignment_id: string
  title: string
  description?: string
  order_index: number
  is_completed: boolean
  estimated_hours?: number
}

export interface CourseNote {
  id: string
  course_id: string
  user_id: string
  title: string
  content: string
  note_type: 'manual' | 'file_upload' | 'ai_generated'
  file_name?: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface Quiz {
  id: string
  user_id: string
  lesson_id?: string
  title: string
  total_questions: number
  passing_score: number
  created_at: string
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  question_text: string
  question_type: 'multiple_choice' | 'short_answer'
  options?: { text: string; is_correct: boolean }[]
  explanation?: string
  order_index: number
}

/** Where a grade came from. v2.1 added `'manual'` so users can enter grades
 *  that aren't in Moodle or the Portal yet. */
export type GradeSource = 'moodle' | 'portal' | 'manual'

export interface Grade {
  course_id: string
  course_name: string
  grade: number | string
  rank?: string

  // ── v2.1 fields ────────────────────────────────────────────────
  /** Origin of the grade — drives the "מקור" badge in the UI. */
  source?: GradeSource
  /** Optional sub-component label (e.g. "מבחן סופי", "תרגיל בית 3").
   *  When set, this is a partial grade for that component, not the final course grade. */
  component?: string
  /** ISO timestamp of the last update — Moodle/Portal scrapes overwrite this on each sync. */
  updated_at?: string
}

// ============================================================
// Student catalog (credits tracking) — moved from lib/drive-db.ts
// in v2.1 so backend code, components, and Drive DB code share one
// definition. lib/drive-db.ts re-exports for backward compat.
// ============================================================

export interface StudentProfile {
  track_id: string
  start_year: number
  current_year: number
  expected_end?: number
  updated_at: string
}

export interface StudentCourse {
  /** Internal row id — unique per DB entry */
  id: string
  /** Catalog course_id (e.g. "68110279") or synthesized "manual_<ts>" */
  course_id: string
  course_name: string
  credits: number
  status: 'completed' | 'in_progress' | 'planned'
  grade?: number
  semester?: string
  academic_year?: string
  source: 'manual' | 'catalog' | 'moodle'
  updated_at: string
}

export interface MoodleStatus {
  moodle: boolean
  portal: boolean
  login_status?: Record<string, any>
}

// ============================================================
// TEEPO Exam (§7 of TEEPO_Exam_v1_0)
// Personal entities live in Drive DB; shared entities live in Supabase.
// ============================================================

export type University = 'BGU' | 'TAU'
export type ExamType = 'midterm' | 'final' | 'makeup'
export type ExamSource = 'portal' | 'manual' | 'moodle'

// ---------- Personal (Drive DB) ----------

export interface Exam {
  id: string
  course_id: string
  title: string
  date: string                 // ISO date (YYYY-MM-DD)
  type: ExamType
  source: ExamSource
}

export type StudyPlanStatus = 'draft' | 'active' | 'paused' | 'completed' | 'abandoned'

export interface StudyPlan {
  id: string
  exam_id: string
  course_id: string
  status: StudyPlanStatus
  daily_minutes: number
  available_days: number[]     // 0=Sun .. 6=Sat
  preferred_time: 'morning' | 'afternoon' | 'evening'
  topics: Topic[]
  days: StudyPlanDay[]
  created_at: string
  exam_date: string
  calendar_synced: boolean
}

export interface Topic {
  id: string
  plan_id: string
  title: string
  source_files: string[]
  self_rating: 1 | 2 | 3 | 4 | 5
  priority_weight: number
  status: 'not_started' | 'in_progress' | 'completed'
}

export type DayStatus = 'upcoming' | 'in_progress' | 'completed' | 'missed'

export interface StudyPlanDay {
  id: string
  plan_id: string
  date: string
  planned_topics: string[]
  planned_activities: PlannedActivity[]
  status: DayStatus
  completion_note?: string
}

export type ActivityType = 'read' | 'practice' | 'flashcards' | 'simulation' | 'review'

export interface PlannedActivity {
  type: ActivityType
  topic_id: string
  minutes: number
  instruction: string
  done: boolean
}

// ---------- Practice ----------

export type PracticeSessionType = 'mcq' | 'open' | 'flashcard'
export type PracticeSessionStatus =
  | 'requested' | 'generating' | 'ready' | 'in_progress' | 'submitted' | 'reviewed'

export interface PracticeSession {
  id: string
  course_id: string
  topic_id: string
  type: PracticeSessionType
  status: PracticeSessionStatus
  questions: Question[]
  score?: number
  created_at: string
}

export interface Question {
  id: string
  session_id: string
  type: PracticeSessionType
  content: string
  options?: McqOption[]
  correct_answer?: string
  explanation?: string
  source_file_ref: string
  user_answer?: string
  is_correct?: boolean
  ai_verdict?: 'full' | 'partial' | 'insufficient' | 'uncertain'
}

export interface McqOption {
  label: 'א' | 'ב' | 'ג' | 'ד'
  text: string
  is_correct: boolean
  explanation: string
}

export type FlashcardStatus = 'new' | 'learning' | 'known' | 'due_again'

export interface Flashcard {
  id: string
  course_id: string
  topic_id: string
  front: string
  back: string
  status: FlashcardStatus
  last_reviewed?: string
  next_due?: string
}

// ---------- Simulation ----------

export type SimulationStatus =
  | 'configured' | 'running' | 'abandoned' | 'submitted' | 'analyzing' | 'complete'

export interface Simulation {
  id: string
  course_id: string
  /** Optional link to an Exam.id when the simulation was launched from one. */
  exam_id?: string
  exam_pdf_ref: string
  duration_minutes: number
  started_at?: string
  submitted_at?: string
  status: SimulationStatus
  score?: number
  analysis?: SimulationAnalysis
}

export interface SimulationAnswer {
  id: string
  simulation_id: string
  question_text: string
  user_answer: string
  ai_evaluation: 'correct' | 'partial' | 'wrong'
  explanation: string
}

export interface SimulationAnalysis {
  estimated_score: number
  by_topic: { topic_id: string; correct_pct: number; n_questions: number }[]
  strengths: string[]
  weaknesses: string[]
  recommendations: { action: string; topic_id: string; minutes: number }[]
}

// ---------- Shared (Supabase) ----------

export type ExamGroupRole = 'creator' | 'member'
export type ExamGroupLifecycle = 'created' | 'active' | 'archiving' | 'archived' | 'dissolved'

export interface ExamGroup {
  id: string
  name: string
  exam_id_ref: string
  course_id_ref: string
  university: University
  creator_user_id: string
  max_members: number
  is_open: boolean
  status: ExamGroupLifecycle
  created_at: string
  archived_at?: string
}

export interface ExamGroupMember {
  id: string
  group_id: string
  user_id: string
  joined_at: string
  role: ExamGroupRole
  status: 'active' | 'left'
}

export interface SharedNote {
  id: string
  group_id: string
  sharer_user_id: string
  drive_file_id: string
  file_title: string
  shared_at: string
  view_count: number
}

export interface GroupQuestion {
  id: string
  group_id: string
  asker_user_id: string
  content: string
  created_at: string
  best_answer_id?: string
}

export interface GroupAnswer {
  id: string
  question_id: string
  answerer_user_id: string
  content: string
  votes: number
  is_ai_generated: boolean
  created_at: string
}

export interface GroupTask {
  id: string
  group_id: string
  creator_id: string
  title: string
  assignee_id?: string
  status: 'open' | 'claimed' | 'done'
  created_at: string
  completed_at?: string
}

export interface GroupMessage {
  id: string
  group_id: string
  sender_id: string
  content: string
  created_at: string
}
