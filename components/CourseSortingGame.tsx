'use client'

/**
 * Course Sorting Game — gamified manual classifier.
 *
 * When Moodle metadata is missing/wrong and auto-classification fails,
 * this walks the user through their unclassified courses one at a time,
 * asking semester + year-of-study. Progress bar, streak counter, little
 * confetti at the end.
 *
 * Triggered from /courses page when there are unclassified courses.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronLeft, SkipForward, Trophy, Sparkles, Flame, CheckCircle2,
} from 'lucide-react'
import type { Course } from '@/types'
import type { Semester, DegreeStart } from '@/lib/semester-classifier'

interface Props {
  courses: Course[]
  /** Called per-course when the user picks semester + year. Resolves when saved. */
  onClassify: (
    id: string,
    updates: {
      semester: Semester
      academic_year: string
      year_of_study?: 1 | 2 | 3 | 4
      classified_manually: true
    }
  ) => Promise<void>
  onClose: () => void
  degreeStart: DegreeStart | null
}

// Build academic-year options from a year_of_study (1-4) relative to degree start.
function yearOfStudyToAcademicYear(yos: 1 | 2 | 3 | 4, degreeStart: DegreeStart): string {
  // Degree that started Oct 2023 → year 1 = 2023, year 2 = 2024, ...
  return String(degreeStart.year + (yos - 1))
}

// Format a Moodle startdate as a friendly hint ("אוקטובר 2024")
function formatHint(ts?: number | null): string | null {
  if (!ts) return null
  const d = new Date(ts * 1000)
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const SEM_OPTIONS: { v: Semester; label: string; sub: string }[] = [
  { v: 'א',   label: "סמסטר א'", sub: 'אוקטובר–פברואר' },
  { v: 'ב',   label: "סמסטר ב'", sub: 'מרץ–יוני' },
  { v: 'קיץ', label: 'סמסטר קיץ', sub: 'יולי–ספטמבר' },
]

const YEAR_OPTIONS: { v: 1 | 2 | 3 | 4; label: string }[] = [
  { v: 1, label: "שנה א'" },
  { v: 2, label: "שנה ב'" },
  { v: 3, label: "שנה ג'" },
  { v: 4, label: "שנה ד'" },
]

export default function CourseSortingGame({ courses, onClassify, onClose, degreeStart }: Props) {
  const [idx, setIdx] = useState(0)
  const [semester, setSemester] = useState<Semester | null>(null)
  const [yos, setYos] = useState<1 | 2 | 3 | 4 | null>(null)
  const [streak, setStreak] = useState(0)
  const [classified, setClassified] = useState(0)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const courseCount = courses.length
  const current = courses[idx]

  // Auto-focus keyboard navigation
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => { containerRef.current?.focus() }, [idx])

  // Reset picks whenever we land on a new course
  useEffect(() => {
    setSemester(null)
    setYos(null)
  }, [idx])

  const advance = () => {
    if (idx + 1 >= courseCount) {
      setDone(true)
    } else {
      setIdx(idx + 1)
    }
  }

  const handleSave = async () => {
    if (!current || !semester || !yos || !degreeStart || saving) return
    setSaving(true)
    try {
      await onClassify(current.id, {
        semester,
        academic_year: yearOfStudyToAcademicYear(yos, degreeStart),
        year_of_study: yos,
        classified_manually: true,
      })
      setStreak(s => s + 1)
      setClassified(c => c + 1)
      advance()
    } catch (e) {
      console.error('Failed to classify:', e)
      setStreak(0) // break streak on error
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    setStreak(0)
    advance()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 's' || e.key === 'S') { handleSkip(); return }
      // 1/2/3 for semester
      if (e.key === '1') setSemester('א')
      if (e.key === '2') setSemester('ב')
      if (e.key === '3') setSemester('קיץ')
      // q/w/e/r for years (Hebrew keyboard-friendly single keys)
      if (e.key === 'q' || e.key === '/') setYos(1)
      if (e.key === 'w' || e.key === "'") setYos(2)
      if (e.key === 'e' || e.key === 'ק') setYos(3)
      if (e.key === 'r' || e.key === 'ר') setYos(4)
      if (e.key === 'Enter' && semester && yos) handleSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semester, yos, done, idx])

  if (!degreeStart) {
    return (
      <Overlay onClose={onClose}>
        <div className="max-w-md w-full glass rounded-2xl p-6 text-center">
          <p className="text-lg text-ink mb-2">צריך להגדיר מתי התחלת את התואר</p>
          <p className="text-sm text-ink-muted mb-5">
            המשחק משתמש בזה כדי לחשב אוטומטית לאיזו שנה אקדמית שייך כל סמסטר.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl btn-gradient shadow-glow-sm text-sm font-medium"
          >
            סגור
          </button>
        </div>
      </Overlay>
    )
  }

  if (done || !current) {
    return (
      <Overlay onClose={onClose}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full glass rounded-3xl p-8 text-center relative overflow-hidden"
        >
          {/* Confetti-ish gradient */}
          <div className="pointer-events-none absolute inset-0 opacity-30"
               style={{ background: 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.3), transparent 60%)' }}
          />
          <div className="relative">
            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center shadow-glow"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Trophy size={40} className="text-white" />
            </motion.div>
            <h2 className="text-2xl font-bold text-ink mb-2">כל הכבוד!</h2>
            <p className="text-ink-muted mb-5">
              {classified > 0
                ? `סיווגת ${classified} קורסים ידנית. הם יופיעו במקום הנכון בלוח.`
                : 'לא סיווגת קורסים הפעם.'}
            </p>
            {streak >= 3 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm mb-5"
                   style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                <Flame size={14} />
                רצף של {streak} קורסים — 🔥
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-xl btn-gradient shadow-glow-sm font-medium"
              >
                סיימתי
              </button>
            </div>
          </div>
        </motion.div>
      </Overlay>
    )
  }

  const progressPct = Math.round(((idx) / courseCount) * 100)
  const hint = formatHint(current.moodle_startdate)

  return (
    <Overlay onClose={onClose}>
      <motion.div
        ref={containerRef}
        tabIndex={-1}
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="max-w-lg w-full glass rounded-3xl overflow-hidden outline-none relative"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:bg-white/5 hover:text-ink transition-colors"
          aria-label="סגור"
        >
          <X size={16} />
        </button>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/5">
          <motion.div
            className="h-full"
            style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="p-6 sm:p-8">
          {/* Header — stats row */}
          <div className="flex items-center justify-between mb-6 text-xs text-ink-muted">
            <span>{idx + 1} / {courseCount}</span>
            <div className="flex items-center gap-3">
              {streak >= 2 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
                >
                  <Flame size={10} /> {streak}
                </motion.span>
              )}
              <span className="inline-flex items-center gap-1">
                <Sparkles size={10} style={{ color: '#a78bfa' }} />
                משחק סידור
              </span>
            </div>
          </div>

          {/* Course card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="mb-6">
                <p className="text-xs text-ink-muted mb-2">איך לסווג את הקורס הבא?</p>
                <h3 className="text-xl sm:text-2xl font-semibold text-ink leading-tight">
                  {current.title}
                </h3>
                {(hint || current.shortname) && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {hint && (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 text-ink-muted">
                        התחיל: {hint}
                      </span>
                    )}
                    {current.shortname && (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 text-ink-muted" dir="ltr">
                        {current.shortname}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Semester picker */}
              <div className="mb-5">
                <p className="text-xs text-ink-muted mb-2">סמסטר</p>
                <div className="grid grid-cols-3 gap-2">
                  {SEM_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.v}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSemester(opt.v)}
                      className={`px-3 py-3 rounded-xl border text-sm transition-all ${
                        semester === opt.v
                          ? 'border-indigo-400/60 bg-indigo-500/10 text-ink shadow-glow-sm'
                          : 'border-white/10 bg-white/5 text-ink-muted hover:border-white/20 hover:text-ink'
                      }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{opt.sub}</div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Year-of-study picker */}
              <div className="mb-6">
                <p className="text-xs text-ink-muted mb-2">שנת לימוד</p>
                <div className="grid grid-cols-4 gap-2">
                  {YEAR_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.v}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setYos(opt.v)}
                      className={`px-3 py-3 rounded-xl border text-sm transition-all ${
                        yos === opt.v
                          ? 'border-violet-400/60 bg-violet-500/10 text-ink shadow-glow-sm'
                          : 'border-white/10 bg-white/5 text-ink-muted hover:border-white/20 hover:text-ink'
                      }`}
                    >
                      {opt.label}
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSkip}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-ink-muted hover:text-ink hover:bg-white/5 transition-colors"
            >
              <SkipForward size={13} />
              דלג
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSave}
              disabled={!semester || !yos || saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-gradient shadow-glow-sm font-medium text-sm disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              {idx + 1 === courseCount ? 'סיום' : 'הבא'}
              {idx + 1 !== courseCount && <ChevronLeft size={14} />}
            </button>
          </div>

          {/* Keyboard hint */}
          <p className="text-[10px] text-ink-subtle mt-3 text-center">
            קיצורים: 1/2/3 לסמסטר · Q/W/E/R לשנה · Enter לאישור · S לדלג
          </p>
        </div>
      </motion.div>
    </Overlay>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </motion.div>
  )
}
