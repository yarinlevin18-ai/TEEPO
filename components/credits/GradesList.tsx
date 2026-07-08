'use client'

/**
 * Grades list with source badges (task #17).
 *
 * The Python backend (Moodle/Portal grade scrape) has been retired. Grades now
 * live entirely in the Drive DB as `student_courses[]` entries that carry a
 * `grade` field. This component derives its list from `useDB()` — every
 * StudentCourse with a grade set — and shows a source badge per row. Includes a
 * "+ הוסף ציון ידני" button that opens ManualGradeModal, which writes back into
 * the Drive DB via `upsertStudentCourse`.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Award, Plus } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import type { StudentCourse } from '@/types'
import GradeSourceBadge from './GradeSourceBadge'
import ManualGradeModal from './ManualGradeModal'

function getGradeColor(grade: number | null | undefined): string {
  if (grade == null) return '#94a3b8'
  if (grade >= 90) return '#10b981'
  if (grade >= 80) return '#3b82f6'
  if (grade >= 70) return '#f59e0b'
  if (grade >= 60) return '#f97316'
  return '#ef4444'
}

export default function GradesList() {
  const { db } = useDB()
  const [modalOpen, setModalOpen] = useState(false)

  // Grades come straight from the Drive DB: every student_course that has a
  // numeric grade set. No network fetch, no loading/error state.
  const grades = useMemo<StudentCourse[]>(
    () => (db.student_courses || []).filter(c => c.grade != null),
    [db.student_courses],
  )

  // Credit-weighted average across graded courses (falls back to a plain mean
  // when credits are missing/zero).
  const average = useMemo<number | null>(() => {
    if (grades.length === 0) return null
    let weightSum = 0
    let gradeSum = 0
    for (const g of grades) {
      const w = g.credits && g.credits > 0 ? g.credits : 1
      weightSum += w
      gradeSum += (g.grade as number) * w
    }
    return weightSum > 0 ? gradeSum / weightSum : null
  }, [grades])

  return (
    <section className="grades-v2-card">
      {/* Header */}
      <div className="grades-v2-head">
        <div className="grades-v2-title">
          <div className="grades-v2-title-icon">
            <Award size={14} />
          </div>
          <h2>הציונים שלי</h2>
          {average != null && (
            <span
              className="grades-v2-avg"
              style={{
                background: `${getGradeColor(average)}20`,
                color: getGradeColor(average),
                border: `1px solid ${getGradeColor(average)}40`,
              }}
            >
              ממוצע {average.toFixed(1)}
            </span>
          )}
        </div>
        <div className="grades-v2-actions">
          <button
            onClick={() => setModalOpen(true)}
            className="grades-v2-add"
          >
            <Plus size={12} />
            הוסף ציון ידני
          </button>
        </div>
      </div>

      {/* Body */}
      {grades.length === 0 ? (
        <div className="grades-v2-empty">
          <p className="title">אין ציונים עדיין</p>
          <p className="sub">הוסף ציון ידני כדי להתחיל</p>
        </div>
      ) : (
        <div className="grades-v2-list">
          {grades.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4) }}
              className="grades-v2-row"
            >
              {/* Grade pill */}
              <div
                className="grades-v2-pill"
                style={{
                  background: `${getGradeColor(g.grade)}15`,
                  color: getGradeColor(g.grade),
                  border: `1px solid ${getGradeColor(g.grade)}30`,
                }}
              >
                {g.grade != null ? g.grade : '—'}
              </div>

              {/* Course meta */}
              <div className="grades-v2-info">
                <p className="name">{g.course_name}</p>
                <div className="meta">
                  <GradeSourceBadge source={g.source} size="compact" />
                  {(g.semester || g.academic_year) && (
                    <span>
                      {[g.semester, g.academic_year].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {g.credits != null && (
                    <span>{g.credits} נק״ז</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <ManualGradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </section>
  )
}
