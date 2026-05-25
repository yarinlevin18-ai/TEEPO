'use client'

/**
 * Modal for manual grade entry (task #17).
 *
 * Posts to POST /api/grades/manual. The endpoint upserts on
 * (course_name, semester, component) — re-submitting the same triplet
 * overwrites, which doubles as "edit" without a separate UI.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import Modal from '@/components/ui/Modal'

interface Props {
  open: boolean
  onClose: () => void
  /** Called after a successful submit so the parent can refresh its grade list. */
  onSuccess?: () => void
  /** Pre-fill course name if launched from a specific course's context. */
  defaultCourseName?: string
  /** Pre-fill semester (e.g. "א'") so per-semester views can streamline entry. */
  defaultSemester?: string
}

export default function ManualGradeModal({
  open,
  onClose,
  onSuccess,
  defaultCourseName = '',
  defaultSemester = '',
}: Props) {
  const [courseName, setCourseName] = useState(defaultCourseName)
  const [grade, setGrade] = useState('')
  const [credits, setCredits] = useState('')
  const [semester, setSemester] = useState(defaultSemester)
  const [academicYear, setAcademicYear] = useState('')
  const [component, setComponent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setCourseName(defaultCourseName)
    setGrade('')
    setCredits('')
    setSemester(defaultSemester)
    setAcademicYear('')
    setComponent('')
    setError(null)
    setSubmitting(false)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseName.trim()) {
      setError('חובה למלא שם קורס')
      return
    }
    const gradeNum = grade.trim() ? parseFloat(grade) : undefined
    if (gradeNum !== undefined && (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100)) {
      setError('ציון חייב להיות בטווח 0–100')
      return
    }
    if (gradeNum === undefined) {
      setError('חובה למלא ציון')
      return
    }
    const creditsNum = credits.trim() ? parseFloat(credits) : undefined
    if (creditsNum !== undefined && (isNaN(creditsNum) || creditsNum < 0 || creditsNum > 30)) {
      setError('נקודות זכות בטווח 0–30')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await api.grades.createManual({
        course_name: courseName.trim(),
        grade: gradeNum,
        credits: creditsNum,
        semester: semester.trim() || undefined,
        academic_year: academicYear.trim() || undefined,
        component: component.trim() || undefined,
      })
      onSuccess?.()
      reset()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'שמירת ציון נכשלה')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="הוספת ציון ידני">
      <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            שם הקורס <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="לדוגמה: מבוא למדעי המחשב"
            className="input-dark w-full"
            autoFocus
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              ציון <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="85"
              className="input-dark w-full"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">נק״ז</label>
            <input
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              placeholder="3"
              className="input-dark w-full"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">סמסטר</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="input-dark w-full"
              disabled={submitting}
            >
              <option value="">— ללא —</option>
              <option value="א'">א'</option>
              <option value="ב'">ב'</option>
              <option value="קיץ">קיץ</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">שנה אקדמית</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder='לדוגמה: 2024'
              className="input-dark w-full"
              disabled={submitting}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            רכיב ציון (אופציונלי)
          </label>
          <input
            type="text"
            value={component}
            onChange={(e) => setComponent(e.target.value)}
            placeholder="ריק = ציון סופי. למשל: מבחן סופי, תרגיל בית 3"
            className="input-dark w-full"
            disabled={submitting}
          />
          <p className="text-[10px] text-ink-subtle mt-1">
            השארה ריקה = ציון סופי לקורס. שליחה חוזרת עם אותו רכיב + סמסטר תעדכן את הקיים.
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm text-ink-muted hover:text-ink hover:bg-white/[0.04] transition-colors"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={submitting || !courseName.trim() || !grade.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'שומר...' : 'שמור ציון'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
