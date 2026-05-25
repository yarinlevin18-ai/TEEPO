'use client'

/**
 * Grades list with source badges (task #17).
 *
 * Reads from `api.grades.list()` (which returns DB-saved grades merged with
 * live Moodle/Portal scrapes). Each row shows the grade source badge so the
 * user can tell where each value came from. Includes a "+ הוסף ציון ידני"
 * button that opens ManualGradeModal.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Award, Plus, Loader2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api-client'
import GradeSourceBadge from './GradeSourceBadge'
import ManualGradeModal from './ManualGradeModal'

interface BackendGrade {
  course_id?: string
  course_name: string
  grade?: number | null
  grade_text?: string | null
  semester?: string | null
  academic_year?: string | null
  credits?: number | null
  rank?: string | null
  component?: string | null
  source?: string | null
}

function getGradeColor(grade: number | null | undefined): string {
  if (grade == null) return '#94a3b8'
  if (grade >= 90) return '#10b981'
  if (grade >= 80) return '#3b82f6'
  if (grade >= 70) return '#f59e0b'
  if (grade >= 60) return '#f97316'
  return '#ef4444'
}

export default function GradesList() {
  const [grades, setGrades] = useState<BackendGrade[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.grades.list()
      setGrades(data.grades || [])
      setAverage(data.average ?? null)
    } catch (e: any) {
      setError(e?.message || 'טעינת ציונים נכשלה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

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
            onClick={reload}
            disabled={loading}
            className="grades-v2-refresh"
            title="רענון"
            aria-label="רענן רשימת ציונים"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
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
      {loading && grades.length === 0 ? (
        <div className="grades-v2-loading">
          <Loader2 size={16} className="spin" />
        </div>
      ) : error ? (
        <p className="grades-v2-error">{error}</p>
      ) : grades.length === 0 ? (
        <div className="grades-v2-empty">
          <p className="title">אין ציונים עדיין</p>
          <p className="sub">סנכרן את ה-Moodle או הוסף ציון ידני</p>
        </div>
      ) : (
        <div className="grades-v2-list">
          {grades.map((g, i) => (
            <motion.div
              key={`${g.course_name}-${g.semester || ''}-${g.component || ''}-${i}`}
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
                {g.grade != null ? g.grade : g.grade_text || '—'}
              </div>

              {/* Course meta */}
              <div className="grades-v2-info">
                <p className="name">{g.course_name}</p>
                <div className="meta">
                  <GradeSourceBadge source={g.source} size="compact" />
                  {g.component && (
                    <span>{g.component}</span>
                  )}
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
        onSuccess={reload}
      />
    </section>
  )
}
