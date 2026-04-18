// ============================================================
// טיפוסי TypeScript לאפליקציית הלימודים
// ============================================================

/** Per-user app settings stored inside the Drive DB */
export interface UserSettings {
  /** Gregorian year the user started their degree (e.g. 2023) */
  degree_start_year?: number
  /** Month (1-12) the user started — normally 10 (October). Used to align year-of-study boundaries. */
  degree_start_month?: number
  /** True if the user does summer semesters (shows קיץ slots even if empty) */
  takes_summer?: boolean
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

/** NotebookLM-style notebook — a collection of sources the AI can ground answers in. */
export interface Notebook {
  id: string
  user_id: string
  title: string
  description?: string
  /** Optional tie-in to a course — the AI gets that extra context too. */
  course_id?: string
  created_at: string
  updated_at: string
  /** Persistent chat history for this notebook. */
  chat_history?: ChatMessage[]
}

export type NotebookSourceType = 'pdf' | 'text' | 'url' | 'lesson_ref'

/** A single source (PDF, pasted text, URL, or reference to an existing lesson). */
export interface NotebookSource {
  id: string
  notebook_id: string
  type: NotebookSourceType
  title: string
  /** Extracted plaintext. Capped at ~200KB per source to keep the DB slim. */
  content: string
  file_name?: string
  url?: string
  lesson_id?: string
  /** Approximate page/section count — just for display. */
  meta?: { pages?: number; words?: number; used_ocr?: boolean }
  created_at: string
}

export interface BGUGrade {
  course_id: string
  course_name: string
  grade: number | string
  rank?: string
}

export interface BGUStatus {
  moodle: boolean
  portal: boolean
  login_status?: Record<string, any>
}
