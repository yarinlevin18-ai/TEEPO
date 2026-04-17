'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ChevronDown, ChevronUp, Plus, ExternalLink,
  Calendar, Tag, Pencil, Search, LayoutGrid,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import ErrorAlert from '@/components/ui/ErrorAlert'
import GlowCard from '@/components/ui/GlowCard'
import Modal from '@/components/ui/Modal'
import type { Course } from '@/types'

// ── Department detection ────────────────────────────────────────────

type DepartmentLabel =
  | 'מדעי המחשב'
  | 'מתמטיקה'
  | 'אנגלית'
  | 'פיזיקה'
  | 'הנדסת חשמל'
  | 'כללי'
  | 'אחר'

const DEPARTMENT_KEYWORDS: Record<Exclude<DepartmentLabel, 'אחר'>, string[]> = {
  'מדעי המחשב': ['תכנות', 'אלגוריתם', 'מבני נתונים', 'מערכות הפעלה', 'רשתות', 'בסיסי נתונים', 'תוכנה', 'חישוב', 'לוגיקה'],
  'מתמטיקה': ['חשבון', 'אלגברה', 'הסתברות', 'סטטיסטיקה', 'מתמטיקה', 'ליניארית'],
  'אנגלית': ['אנגלית', 'english'],
  'פיזיקה': ['פיזיקה', 'מכניקה', 'אלקטרו'],
  'הנדסת חשמל': ['מעגלים', 'אותות', 'אלקטרוניקה', 'ספרתי'],
  'כללי': ['מבוא', 'סמינר', 'פרויקט'],
}

const ALL_DEPARTMENTS: Array<'הכל' | DepartmentLabel> = [
  'הכל', 'מדעי המחשב', 'מתמטיקה', 'אנגלית', 'פיזיקה', 'הנדסת חשמל', 'כללי', 'אחר',
]

function detectDepartment(title: string): DepartmentLabel {
  const lower = title.toLowerCase()
  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS) as [Exclude<DepartmentLabel, 'אחר'>, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return dept
    }
  }
  return 'אחר'
}

type ViewMode = 'year-semester' | 'department'

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
  const [editingCourse, setEditingCourse] = useState<CourseWithMeta | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartment, setActiveDepartment] = useState<'הכל' | DepartmentLabel>('הכל')
  const [viewMode, setViewMode] = useState<ViewMode>('year-semester')

  const yearOptions = useMemo(() => guessYearOptions(), [])

  // Load courses — semester/year now come from Supabase columns
  useEffect(() => {
    const load = async () => {
      try {
        const data: Course[] = await api.courses.list()

        const enriched: CourseWithMeta[] = data.map((c) => {
          const guess = guessSemesterFromTitle(c.title)
          return {
            ...c,
            semester: (c as any).semester || guess.semester,
            year: (c as any).academic_year || guess.year,
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

  const handleEditSave = async (updates: {
    title: string
    semester?: SemesterLabel
    year?: string
    status: 'active' | 'paused' | 'completed'
  }) => {
    if (!editingCourse) return
    const id = editingCourse.id
    // Update local state immediately
    setCourses((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, title: updates.title, semester: updates.semester, year: updates.year, status: updates.status }
          : c
      )
    )
    setEditingCourse(null)
    // Persist to Supabase
    try {
      await api.courses.update(id, {
        title: updates.title,
        semester: updates.semester || null,
        academic_year: updates.year || null,
        status: updates.status,
      })
    } catch (e) {
      console.error('Failed to save course:', e)
      setError('שגיאה בשמירת הקורס. נסה שוב.')
    }
  }

  // ── Filter courses by search + department ─────────────────────────
  const filteredCourses = useMemo(() => {
    let result = courses

    // Text search (case-insensitive, Hebrew-safe)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter((c) => c.title.toLowerCase().includes(q))
    }

    // Department filter
    if (activeDepartment !== 'הכל') {
      result = result.filter((c) => detectDepartment(c.title) === activeDepartment)
    }

    return result
  }, [courses, searchQuery, activeDepartment])

  // ── Group courses by year → semester ──────────────────────────────
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, CourseWithMeta[]>> = {}
    const unassigned: CourseWithMeta[] = []

    filteredCourses.forEach((c) => {
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
  }, [filteredCourses])

  // ── Group courses by department ───────────────────────────────────
  const groupedByDept = useMemo(() => {
    const map: Record<DepartmentLabel, CourseWithMeta[]> = {
      'מדעי המחשב': [],
      'מתמטיקה': [],
      'אנגלית': [],
      'פיזיקה': [],
      'הנדסת חשמל': [],
      'כללי': [],
      'אחר': [],
    }

    filteredCourses.forEach((c) => {
      const dept = detectDepartment(c.title)
      map[dept].push(c)
    })

    // Only return departments that have courses
    const activeDepts = (Object.keys(map) as DepartmentLabel[]).filter(
      (d) => map[d].length > 0
    )

    return { activeDepts, map }
  }, [filteredCourses])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const semesterOrder: Record<string, number> = { 'א': 1, 'ב': 2, 'קיץ': 3, 'ללא סמסטר': 4 }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4 animate-fade-in">
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">הקורסים שלי</h1>
          <p className="text-ink-muted text-sm mt-1">
            {courses.length} קורסים
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          {courses.length > 0 && (
            <div className="flex items-center bg-white/5 border border-white/[0.08] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('year-semester')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'year-semester'
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title="קיבוץ לפי שנה וסמסטר"
              >
                <Calendar size={14} />
              </button>
              <button
                onClick={() => setViewMode('department')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'department'
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title="קיבוץ לפי מחלקה"
              >
                <LayoutGrid size={14} />
              </button>
            </div>
          )}
          <Link href="/courses/extract">
            <button className="btn-gradient flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90">
              <Plus size={16} /> הוסף קורס
            </button>
          </Link>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Search bar */}
      {courses.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חפש קורס..."
            className="input-dark w-full pr-10"
            dir="rtl"
          />
        </div>
      )}

      {/* Department chips */}
      {courses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ALL_DEPARTMENTS.map((dept) => {
            const isActive = activeDepartment === dept
            return (
              <button
                key={dept}
                onClick={() => setActiveDepartment(dept)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-white/5 text-slate-400 border border-white/[0.08] hover:bg-white/[0.08]'
                }`}
              >
                {dept}
              </button>
            )
          })}
        </div>
      )}

      {/* Result count */}
      {courses.length > 0 && (searchQuery || activeDepartment !== 'הכל') && (
        <p className="text-xs text-ink-muted">
          מציג {filteredCourses.length} קורסים
        </p>
      )}

      {courses.length === 0 ? (
        <GlowCard className="text-center">
        <div className="p-12">
          <BookOpen size={32} className="text-white/10 mx-auto mb-4" />
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
        </GlowCard>
      ) : filteredCourses.length === 0 ? (
        <GlowCard className="text-center">
          <div className="p-12">
            <Search size={32} className="text-white/10 mx-auto mb-4" />
            <p className="text-ink-muted mb-2">לא נמצאו קורסים</p>
            <p className="text-ink-subtle text-sm">נסה לשנות את החיפוש או הסינון</p>
          </div>
        </GlowCard>
      ) : viewMode === 'year-semester' ? (
        <>
          {/* Grouped courses by year/semester */}
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
                                onEdit={() => setEditingCourse(course)}
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
                    onEdit={() => setEditingCourse(course)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Grouped courses by department */}
          {groupedByDept.activeDepts.map((deptKey) => {
            const deptCollapsed = collapsedGroups[`dept-${deptKey}`]
            const deptCourses = groupedByDept.map[deptKey]

            return (
              <div key={deptKey} className="space-y-3">
                {/* Department header */}
                <button
                  onClick={() => toggleGroup(`dept-${deptKey}`)}
                  className="flex items-center gap-3 w-full text-right group"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                    <LayoutGrid size={16} className="text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-ink">{deptKey}</h2>
                  </div>
                  <span className="text-xs text-ink-muted">{deptCourses.length} קורסים</span>
                  {deptCollapsed ? (
                    <ChevronDown size={16} className="text-ink-muted" />
                  ) : (
                    <ChevronUp size={16} className="text-ink-muted" />
                  )}
                </button>

                <AnimatePresence>
                  {!deptCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid sm:grid-cols-2 gap-3 mr-4">
                        {deptCourses.map((course) => (
                          <CourseCard
                            key={course.id}
                            course={course}
                            onEdit={() => setEditingCourse(course)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </>
      )}

      {/* Edit Course Modal */}
      <EditCourseModal
        course={editingCourse}
        onClose={() => setEditingCourse(null)}
        onSave={handleEditSave}
        yearOptions={yearOptions}
      />
    </div>
  )
}

// ── Edit Course Modal ───────────────────────────────────────────────

const STATUS_OPTIONS: { value: 'active' | 'paused' | 'completed'; label: string; color: string }[] = [
  { value: 'active', label: 'פעיל', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  { value: 'paused', label: 'מושהה', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'completed', label: 'הושלם', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
]

function EditCourseModal({
  course,
  onClose,
  onSave,
  yearOptions,
}: {
  course: CourseWithMeta | null
  onClose: () => void
  onSave: (updates: { title: string; semester?: SemesterLabel; year?: string; status: 'active' | 'paused' | 'completed' }) => void
  yearOptions: string[]
}) {
  const [localTitle, setLocalTitle] = useState('')
  const [localSem, setLocalSem] = useState<SemesterLabel | ''>('')
  const [localYear, setLocalYear] = useState('')
  const [localStatus, setLocalStatus] = useState<'active' | 'paused' | 'completed'>('active')

  // Sync local state when a new course is opened for editing
  useEffect(() => {
    if (course) {
      setLocalTitle(course.title)
      setLocalSem(course.semester || '')
      setLocalYear(course.year || '')
      setLocalStatus(course.status || 'active')
    }
  }, [course])

  const handleSave = () => {
    onSave({
      title: localTitle,
      semester: localSem || undefined,
      year: localYear || undefined,
      status: localStatus,
    })
  }

  const currentStatusOption = STATUS_OPTIONS.find((s) => s.value === localStatus)

  return (
    <Modal
      open={!!course}
      onClose={onClose}
      title="עריכת קורס"
      size="md"
      footer={
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-white/10 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/15 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            className="btn-gradient px-5 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            שמור
          </button>
        </div>
      }
    >
      <div className="space-y-5" dir="rtl">
        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-muted">שם הקורס</label>
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            className="input-dark w-full"
            dir="rtl"
          />
        </div>

        {/* Year + Semester row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-muted">שנה אקדמית</label>
            <select
              value={localYear}
              onChange={(e) => setLocalYear(e.target.value)}
              className="w-full text-sm bg-[#1e2330] border border-white/10 rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-indigo-500/50 transition-colors"
            >
              <option value="" className="bg-[#1e2330] text-gray-300">לא נבחר</option>
              {yearOptions.map((y) => (
                <option key={y} value={y} className="bg-[#1e2330] text-gray-300">{y}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-muted">סמסטר</label>
            <select
              value={localSem}
              onChange={(e) => setLocalSem(e.target.value as SemesterLabel | '')}
              className="w-full text-sm bg-[#1e2330] border border-white/10 rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-indigo-500/50 transition-colors"
            >
              <option value="" className="bg-[#1e2330] text-gray-300">לא נבחר</option>
              {SEMESTER_OPTIONS.map((s) => (
                <option key={s.value} value={s.value} className="bg-[#1e2330] text-gray-300">{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-muted">סטטוס</label>
          <select
            value={localStatus}
            onChange={(e) => setLocalStatus(e.target.value as 'active' | 'paused' | 'completed')}
            className="w-full text-sm bg-[#1e2330] border border-white/10 rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-indigo-500/50 transition-colors"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value} className="bg-[#1e2330] text-gray-300">{s.label}</option>
            ))}
          </select>
          {/* Status badge preview */}
          {currentStatusOption && (
            <div className="mt-2">
              <span className={`inline-block text-xs px-2.5 py-1 rounded-full border ${currentStatusOption.color}`}>
                {currentStatusOption.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Course Card ──────────────────────────────────────────────────────

function CourseCard({
  course,
  onEdit,
}: {
  course: CourseWithMeta
  onEdit: () => void
}) {
  return (
    <GlowCard className="group hover:scale-[1.01] transition-transform">
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-ink leading-snug line-clamp-2 flex-1">
            {course.title}
          </p>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors flex-shrink-0"
            title="ערוך קורס"
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
    </GlowCard>
  )
}
