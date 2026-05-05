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
import GlowCard from '@/components/ui/GlowCard'
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
    <GlowCard glowColor="rgba(99,102,241,0.10)">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.15)' }}
            >
              <Award size={14} style={{ color: '#818cf8' }} />
            </div>
            <h2 className="font-semibold text-ink">הציונים שלי</h2>
            {average != null && (
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
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
          <div className="flex items-center gap-1">
            <button
              onClick={reload}
              disabled={loading}
              className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/[0.04] transition-colors disabled:opacity-50"
              title="רענון"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Plus size={12} />
              הוסף ציון ידני
            </button>
          </div>
        </div>

        {/* Body */}
        {loading && grades.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-ink-subtle">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-400 py-4">{error}</p>
        ) : grades.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-ink-muted">אין ציונים עדיין</p>
            <p className="text-[11px] text-ink-subtle mt-1">
              סנכרן את ה-Moodle או הוסף ציון ידני
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {grades.map((g, i) => (
              <motion.div
                key={`${g.course_name}-${g.semester || ''}-${g.component || ''}-${i}`}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.4) }}
                className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-white/[0.02]"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                {/* Grade pill */}
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold"
                  style={{
                    background: `${getGradeColor(g.grade)}15`,
                    color: getGradeColor(g.grade),
                    border: `1px solid ${getGradeColor(g.grade)}30`,
                  }}
                >
                  {g.grade != null ? g.grade : g.grade_text || '—'}
                </div>

                {/* Course meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{g.course_name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <GradeSourceBadge source={g.source} size="compact" />
                    {g.component && (
                      <span className="text-[10px] text-ink-subtle">{g.component}</span>
                    )}
                    {(g.semester || g.academic_year) && (
                      <span className="text-[10px] text-ink-subtle">
                        {[g.semester, g.academic_year].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {g.credits != null && (
                      <span className="text-[10px] text-ink-subtle">
                        {g.credits} נק״ז
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <ManualGradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={reload}
      />
    </GlowCard>
  )
}
