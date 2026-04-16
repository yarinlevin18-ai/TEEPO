'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ChevronDown, ChevronUp, Plus, ExternalLink,
  Loader2, Calendar, Tag, Check, X, Pencil,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { Course } from '@/types'

// ── Semester / Year helpers ──────────────────────────────────────────

type SemesterLabel = 'א' | 'ב' | 'קיץ'

const SEMESTER_OPTIONS: { value: SemesterLabel; label: string }[] = [
  { value: 'א', label: "סמסטר א'" },
  { value: 'ב', label: "סמסטר ב'" },
  { value: 'קיץ', label: 'קיץ' },
]

function guessYearOptions(): string[] {
  const now = new Date()
  const y = now.getFullYear()
  // Academic year: if we're before September, current year is y-1/y, else y/y+1
  const options: string[] = []
  for (let i = y + 1; i >= y - 4; i--) {
    options.push(`${i - 1}/${i}`)
  }
  return options
}

function guessSemesterFromTitle(title: string): { semester?: SemesterLabel; year?: string } {
  const result: { semester?: SemesterLabel; year?: string } = {}

  // Look for "סמ 1" / "סמ 2" / "סמסטר א" / "S1" / "S2"
  if (/סמ['\s]*1|סמסטר\s*א|sem(?:ester)?\s*1|\bS1\b/i.test(title)) {
    result.semester = 'א'
  } else if (/סמ['\s]*2|סמסטר\s*ב|sem(?:ester)?\s*2|\bS2\b/i.test(title)) {
    result.semester = 'ב'
  } else if (/קיץ|summer/i.test(title)) {
    result.semester = 'קיץ'
  }

  return result
}

// ── Course with local semester/year ─────────────────────────────────

interface CourseWithMeta extends Course {
  semester?: SemesterLabel
  year?: string
}

// ── Main Component ──────────────────────────────────────────────────

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const yearOptions = useMemo(() => guessYearOptions(), [])

  // Load courses & merge with saved semester/year from localStorage
  useEffect(() => {
    const load = async () => {
      try {
        const data: Course[] = await api.courses.list()
        // Load saved semester/year from localStorage
        const saved: Record<string, { semester?: SemesterLabel; year?: string }> =
          JSON.parse(localStorage.getItem('course-semesters') || '{}')

        const enriched: CourseWithMeta[] = data.map((c) => {
          const s = saved[c.id]
          const guess = guessSemesterFromTitle(c.title)
          return {
            ...c,
            semester: s?.semester || guess.semester,
            year: s?.year || guess.year,
          }
        })
        setCourses(enriched)
      } catch (e: any) {
        console.error(e)
        setError('שגיאה בטעינת הקורסים. נסה לרענן.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Save semester/year to localStorage whenever courses change
  const persistMeta = (updated: CourseWithMeta[]) => {
    const map: Record<string, { semester?: SemesterLabel; year?: string }> = {}
    updated.forEach((c) => {
      if (c.semester || c.year) {
        map[c.id] = { semester: c.semester, year: c.year }
      }
    })
    localStorage.setItem('course-semesters', JSON.stringify(map))
  }

  const updateCourseMeta = (id: string, semester?: SemesterLabel, year?: string) => {
    setCourses((prev) => {
      const updated = prev.map((c) =>
        c.id === id ? { ...c, semester, year } : c
      )
      persistMeta(updated)
      return updated
    })
  }

  // ── Group courses by year → semester ──────────────────────────────
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, CourseWithMeta[]>> = {}
    const unassigned: CourseWithMeta[] = []

    courses.forEach((c) => {
      if (!c.year && !c.semester) {
        unassigned.push(c)
        return
      }
      const yearKey = c.year || 'ללא שנה'
      const semKey = c.semester || 'ללא סמסטר'
      if (!map[yearKey]) map[yearKey] = {}
      if (!map[yearKey][semKey]) map[yearKey][semKey] = []
      map[yearKey][semKey].push(c)
    })

    // Sort years descending (newest first)
    const sortedYears = Object.keys(map).sort((a, b) => b.localeCompare(a))

    return { sortedYears, map, unassigned }
  }, [courses])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const semesterOrder: Record<string, number> = { 'א': 1, 'ב': 2, 'קיץ': 3, 'ללא סמסטר': 4 }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4 animate-fade-in">
        <div className="h-8 w-48 shimmer rounded-lg" />
        <div className="h-4 w-64 shimmer rounded-lg" />
        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 shimmer rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">הקורסים שלי</h1>
          <p className="text-ink-muted text-sm mt-1">
            {courses.length} קורסים &middot; מסודרים לפי שנה וסמסטר
          </p>
        </div>
        <Link href="/courses/extract">
          <button className="btn-gradient flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90">
            <Plus size={16} /> הוסף קורס
          </button>
        </Link>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {courses.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <BookOpen size={40} className="text-white/10 mx-auto mb-4" />
          <p className="text-ink-muted mb-2">עדיין לא הוספת קורסים</p>
          <p className="text-ink-subtle text-sm mb-4">חבר את חשבון BGU שלך או הוסף קורס מ-Udemy/Coursera</p>
          <div className="flex gap-3 justify-center">
            <Link href="/bgu-connect">
              <button className="px-4 py-2 border border-white/10 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/15 transition-colors">
                חבר BGU
              </button>
            </Link>
            <Link href="/courses/extract">
              <button className="btn-gradient px-4 py-2 rounded-xl text-sm font-medium text-white">
                הוסף קורס ידנית
              </button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Grouped courses */}
          {grouped.sortedYears.map((yearKey) => {
            const yearCollapsed = collapsedGroups[`year-${yearKey}`]
            const semesters = Object.keys(grouped.map[yearKey]).sort(
              (a, b) => (semesterOrder[a] || 99) - (semesterOrder[b] || 99)
            )
            const totalInYear = semesters.reduce(
              (sum, s) => sum + grouped.map[yearKey][s].length, 0
            )

            return (
              <div key={yearKey} className="space-y-3">
                {/* Year header */}
                <button
                  onClick={() => toggleGroup(`year-${yearKey}`)}
                  className="flex items-center gap-3 w-full text-right group"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                    <Calendar size={16} className="text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-ink">{yearKey}</h2>
                  </div>
                  <span className="text-xs text-ink-muted">{totalInYear} קורסים</span>
                  {yearCollapsed ? (
                    <ChevronDown size={16} className="text-ink-muted" />
                  ) : (
                    <ChevronUp size={16} className="text-ink-muted" />
                  )}
                </button>

                <AnimatePresence>
                  {!yearCollapsed && semesters.map((semKey) => {
                    const semCourses = grouped.map[yearKey][semKey]
                    const semLabel = semKey === 'א' ? "סמסטר א'" : semKey === 'ב' ? "סמסטר ב'" : semKey === 'קיץ' ? 'קיץ' : semKey

                    return (
                      <motion.div
                        key={semKey}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mr-4 border-r border-white/5 pr-4 space-y-3 pb-2">
                          <div className="flex items-center gap-2">
                            <Tag size={14} className="text-violet-400" />
                            <h3 className="text-sm font-semibold text-ink-muted">{semLabel}</h3>
                            <span className="text-xs text-ink-subtle">({semCourses.length})</span>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-3">
                            {semCourses.map((course) => (
                              <CourseCard
                                key={course.id}
                                course={course}
                                editing={editingId === course.id}
                                onEdit={() => setEditingId(editingId === course.id ? null : course.id)}
                                onUpdate={updateCourseMeta}
                                yearOptions={yearOptions}
                              />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )
          })}

          {/* Unassigned courses */}
          {grouped.unassigned.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <BookOpen size={16} className="text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-ink">לא משויכים</h2>
                <span className="text-xs text-ink-muted">{grouped.unassigned.length} קורסים</span>
              </div>
              <p className="text-xs text-ink-subtle mr-11">
                לחץ על העיפרון כדי לשייך קורס לשנה וסמסטר
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mr-4">
                {grouped.unassigned.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    editing={editingId === course.id}
                    onEdit={() => setEditingId(editingId === course.id ? null : course.id)}
                    onUpdate={updateCourseMeta}
                    yearOptions={yearOptions}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Course Card ──────────────────────────────────────────────────────

function CourseCard({
  course,
  editing,
  onEdit,
  onUpdate,
  yearOptions,
}: {
  course: CourseWithMeta
  editing: boolean
  onEdit: () => void
  onUpdate: (id: string, semester?: SemesterLabel, year?: string) => void
  yearOptions: string[]
}) {
  const [localSem, setLocalSem] = useState<SemesterLabel | ''>(course.semester || '')
  const [localYear, setLocalYear] = useState(course.year || '')

  const handleSave = () => {
    onUpdate(course.id, localSem || undefined, localYear || undefined)
    onEdit() // close editor
  }

  const handleCancel = () => {
    setLocalSem(course.semester || '')
    setLocalYear(course.year || '')
    onEdit()
  }

  return (
    <div className="glass rounded-xl overflow-hidden group hover:border-accent/30 transition-all">
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-ink leading-snug line-clamp-2 flex-1">
            {course.title}
          </p>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors flex-shrink-0"
            title="ערוך שנה וסמסטר"
          >
            <Pencil size={14} />
          </button>
        </div>

        {/* Source badge + link */}
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            course.source === 'bgu'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
          }`}>
            {course.source === 'bgu' ? 'BGU' : course.source}
          </span>
          {course.source_url && (
            <a
              href={course.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-subtle hover:text-indigo-400 transition-colors"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        {/* Progress */}
        {course.progress_percentage > 0 && (
          <div>
            <div className="flex justify-between text-xs text-ink-muted mb-1">
              <span>התקדמות</span>
              <span>{Math.round(course.progress_percentage)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/5">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${course.progress_percentage}%`,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Semester/Year editor */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="p-3 space-y-2 bg-white/[0.02]">
              <div className="flex gap-2">
                <select
                  value={localYear}
                  onChange={(e) => setLocalYear(e.target.value)}
                  className="flex-1 text-xs bg-[#1e2330] border border-white/10 rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:border-accent-500"
                >
                  <option value="" className="bg-[#1e2330] text-gray-300">שנה...</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y} className="bg-[#1e2330] text-gray-300">{y}</option>
                  ))}
                </select>
                <select
                  value={localSem}
                  onChange={(e) => setLocalSem(e.target.value as SemesterLabel | '')}
                  className="flex-1 text-xs bg-[#1e2330] border border-white/10 rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:border-accent-500"
                >
                  <option value="" className="bg-[#1e2330] text-gray-300">סמסטר...</option>
                  {SEMESTER_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value} className="bg-[#1e2330] text-gray-300">{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-ink-muted hover:text-ink transition-colors"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={handleSave}
                  className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
