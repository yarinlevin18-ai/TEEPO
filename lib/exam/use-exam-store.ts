'use client'

/**
 * useExamStore — unified hook over exam-related entities.
 *
 * When Drive DB is connected, reads/writes pass through `useDB()` so the data
 * syncs across devices via the user's Google Drive. When Drive isn't ready
 * (dev bypass, sign-in pending, transient error), the hook transparently
 * falls back to localStorage so the UI keeps working.
 *
 * Pages call this hook instead of touching the lib/exam/*-storage.ts files
 * directly. The localStorage helpers remain as the offline fallback.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDB } from '@/lib/db-context'
import {
  loadPlanFromStorage as lsLoadPlan,
  savePlanToStorage as lsSavePlan,
  deletePlanFromStorage as lsDeletePlan,
} from '@/lib/exam/plan-storage'
import {
  loadPracticeSessions as lsLoadSessions,
  savePracticeSession as lsSaveSession,
} from '@/lib/exam/practice-storage'
import {
  loadFlashcards as lsLoadFlashcards,
  upsertFlashcards as lsUpsertFlashcards,
} from '@/lib/exam/flashcard-storage'
import {
  loadSimulations as lsLoadSimulations,
  saveSimulation as lsSaveSimulation,
} from '@/lib/exam/simulation-storage'
import type { Exam, Flashcard, PracticeSession, Simulation, StudyPlan } from '@/types'

interface ExamStore {
  ready: boolean
  /** True when Drive is the source of truth; false when we're falling back to localStorage. */
  driveBacked: boolean

  exams: Exam[]
  upsertExam: (exam: Exam) => Promise<void>
  removeExam: (id: string) => Promise<void>

  plans: StudyPlan[]
  getPlanByExam: (examId: string) => StudyPlan | null
  savePlan: (plan: StudyPlan) => Promise<void>
  removePlan: (id: string) => Promise<void>

  practiceSessions: PracticeSession[]
  savePracticeSession: (session: PracticeSession) => Promise<void>

  flashcards: Flashcard[]
  upsertFlashcards: (cards: Flashcard[]) => Promise<void>

  simulations: Simulation[]
  saveSimulation: (sim: Simulation) => Promise<void>
}

export function useExamStore(): ExamStore {
  const db = useDB()
  const driveBacked = db.driveConnected

  // Local mirror — only used when Drive is not connected.
  const [localExams, setLocalExams] = useState<Exam[]>([])
  const [localPlans, setLocalPlans] = useState<Record<string, StudyPlan>>({})
  const [localSessions, setLocalSessions] = useState<Record<string, PracticeSession[]>>({})
  const [localFlashcards, setLocalFlashcards] = useState<Record<string, Flashcard[]>>({})
  const [localSimulations, setLocalSimulations] = useState<Record<string, Simulation[]>>({})

  // Lazy-load all examIds we know about from localStorage on first mount.
  // We don't have an index — we discover keys directly.
  useEffect(() => {
    if (driveBacked || typeof window === 'undefined') return
    const exams: Exam[] = []
    const plans: Record<string, StudyPlan> = {}
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key) continue
      if (key.startsWith('teepo_exam_plan_')) {
        const examId = key.replace('teepo_exam_plan_', '')
        const plan = lsLoadPlan(examId)
        if (plan) {
          plans[plan.id] = plan
          // Synthesize a minimal Exam record from the plan for the timeline.
          exams.push({
            id: examId,
            course_id: plan.course_id,
            title: examId,
            date: plan.exam_date,
            type: 'midterm',
            source: 'manual',
          })
        }
      }
    }
    setLocalExams(exams)
    setLocalPlans(plans)
  }, [driveBacked])

  // ── Reads ────────────────────────────────────────────────

  const exams = useMemo<Exam[]>(() => {
    return driveBacked ? db.db.exams ?? [] : localExams
  }, [driveBacked, db.db.exams, localExams])

  const plans = useMemo<StudyPlan[]>(() => {
    return driveBacked ? db.db.study_plans ?? [] : Object.values(localPlans)
  }, [driveBacked, db.db.study_plans, localPlans])

  const practiceSessions = useMemo<PracticeSession[]>(() => {
    if (driveBacked) return db.db.practice_sessions ?? []
    return Object.values(localSessions).flat()
  }, [driveBacked, db.db.practice_sessions, localSessions])

  const flashcards = useMemo<Flashcard[]>(() => {
    if (driveBacked) return db.db.flashcards ?? []
    return Object.values(localFlashcards).flat()
  }, [driveBacked, db.db.flashcards, localFlashcards])

  const simulations = useMemo<Simulation[]>(() => {
    if (driveBacked) return db.db.simulations ?? []
    return Object.values(localSimulations).flat()
  }, [driveBacked, db.db.simulations, localSimulations])

  // ── Helpers ──────────────────────────────────────────────

  const getPlanByExam = useCallback(
    (examId: string): StudyPlan | null => {
      const found = plans.find((p) => p.exam_id === examId)
      if (found) return found
      // Fallback: localStorage may have it under the old per-examId key.
      if (!driveBacked && typeof window !== 'undefined') {
        return lsLoadPlan(examId)
      }
      return null
    },
    [plans, driveBacked],
  )

  // ── Writes ───────────────────────────────────────────────

  const upsertExam = useCallback(
    async (exam: Exam) => {
      if (driveBacked) {
        await db.upsertExam(exam)
      } else {
        setLocalExams((prev) => [exam, ...prev.filter((e) => e.id !== exam.id)])
      }
    },
    [driveBacked, db],
  )

  const removeExam = useCallback(
    async (id: string) => {
      if (driveBacked) {
        await db.removeExam(id)
      } else {
        setLocalExams((prev) => prev.filter((e) => e.id !== id))
        if (typeof window !== 'undefined') lsDeletePlan(id)
      }
    },
    [driveBacked, db],
  )

  const savePlan = useCallback(
    async (plan: StudyPlan) => {
      if (driveBacked) {
        await db.upsertStudyPlan(plan)
      } else {
        setLocalPlans((prev) => ({ ...prev, [plan.id]: plan }))
        lsSavePlan(plan.exam_id, plan)
      }
    },
    [driveBacked, db],
  )

  const removePlan = useCallback(
    async (id: string) => {
      if (driveBacked) {
        await db.removeStudyPlan(id)
      } else {
        setLocalPlans((prev) => {
          const target = prev[id]
          if (!target) return prev
          if (typeof window !== 'undefined') lsDeletePlan(target.exam_id)
          const { [id]: _, ...rest } = prev
          return rest
        })
      }
    },
    [driveBacked, db],
  )

  const savePracticeSession = useCallback(
    async (session: PracticeSession) => {
      if (driveBacked) {
        await db.upsertPracticeSession(session)
      } else {
        // Find the plan this session belongs to so we can persist under the
        // existing per-plan localStorage layout.
        const plan = plans.find((p) => p.id === session.course_id || p.course_id === session.course_id)
        const planKey = plan?.id ?? 'free'
        setLocalSessions((prev) => {
          const existing = prev[planKey] ?? []
          return { ...prev, [planKey]: [...existing.filter((s) => s.id !== session.id), session] }
        })
        lsSaveSession(planKey, session)
      }
    },
    [driveBacked, db, plans],
  )

  const upsertFlashcards = useCallback(
    async (cards: Flashcard[]) => {
      if (driveBacked) {
        await db.upsertFlashcards(cards)
      } else {
        // Group by topic_id for the per-plan localStorage layout we already use.
        const byPlan = new Map<string, Flashcard[]>()
        for (const c of cards) {
          const planKey = c.course_id || 'free'
          const arr = byPlan.get(planKey) ?? []
          arr.push(c)
          byPlan.set(planKey, arr)
        }
        const entries = Array.from(byPlan.entries())
        for (const [planKey, group] of entries) {
          lsUpsertFlashcards(planKey, group)
        }
        setLocalFlashcards((prev) => {
          const next = { ...prev }
          for (const [planKey, group] of entries) {
            const existing = next[planKey] ?? []
            const byId = new Map<string, Flashcard>(existing.map((c) => [c.id, c]))
            for (const c of group) byId.set(c.id, c)
            next[planKey] = Array.from(byId.values())
          }
          return next
        })
      }
    },
    [driveBacked, db],
  )

  const saveSimulation = useCallback(
    async (sim: Simulation) => {
      if (driveBacked) {
        await db.upsertSimulation(sim)
      } else {
        const examKey = sim.course_id || 'unknown'
        setLocalSimulations((prev) => {
          const existing = prev[examKey] ?? []
          return { ...prev, [examKey]: [...existing.filter((s) => s.id !== sim.id), sim] }
        })
        lsSaveSimulation(examKey, sim)
      }
    },
    [driveBacked],
  )

  return {
    ready: driveBacked ? db.ready : true,
    driveBacked,
    exams,
    upsertExam,
    removeExam,
    plans,
    getPlanByExam,
    savePlan,
    removePlan,
    practiceSessions,
    savePracticeSession,
    flashcards,
    upsertFlashcards,
    simulations,
    saveSimulation,
  }
}
