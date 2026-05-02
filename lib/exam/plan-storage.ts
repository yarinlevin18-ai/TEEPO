// Temporary plan persistence using localStorage.
// Replaced by Drive DB integration once db-context exposes plan mutators.

import type { StudyPlan } from '@/types'

const KEY = (examId: string) => `teepo_exam_plan_${examId}`

export function loadPlanFromStorage(examId: string): StudyPlan | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY(examId))
    return raw ? (JSON.parse(raw) as StudyPlan) : null
  } catch {
    return null
  }
}

export function savePlanToStorage(examId: string, plan: StudyPlan): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY(examId), JSON.stringify(plan))
}

export function deletePlanFromStorage(examId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(KEY(examId))
}
