// ============================================================
// טיפוסי TypeScript לאפליקציית הלימודים
// ============================================================

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
}

export interface StudyTask {
  id: string
  user_id: string
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
