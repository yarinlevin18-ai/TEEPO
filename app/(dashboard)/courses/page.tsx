'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ChevronDown, ChevronUp, Plus, ExternalLink,
  Calendar, Tag, Pencil, Search, LayoutGrid, RefreshCw, FolderTree,
  GripVertical, Sparkles, Trophy,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDB, useCourses } from '@/lib/db-context'
import ErrorAlert from '@/components/ui/ErrorAlert'
import GlowCard from '@/components/ui/GlowCard'
import Modal from '@/components/ui/Modal'
import CourseSortingGame from '@/components/CourseSortingGame'
import { Gamepad2 } from 'lucide-react'
import type { Course } from '@/types'
import {
  classifyCourse,
  computeYearOfStudy,
  semesterLabel,
  sortKey,
  type Semester,
} from '@/lib/semester-classifier'

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

type SemesterLabel = Semester

const SEMESTER_OPTIONS: { value: SemesterLabel; label: string }[] = [
  { value: 'א', label: "סמסטר א'" },
  { value: 'ב', label: "סמסטר ב'" },
  { value: 'קיץ', label: 'קיץ' },
]

/** Generate academic-year options (single-year format, e.g. "2024" = תשפ"ה). */
function guessYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const currentAY = now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1
  const options: { value: string; label: string }[] = []
  for (let i = currentAY + 1; i >= currentAY - 5; i--) {
    options.push({ value: String(i), label: `${i}/${i + 1}` })
  }
  return options
}

// ── Course with derived metadata ─────────────────────────────────────

interface CourseWithMeta extends Course {
  /** Year of study (1-4); may be inferred if degree_start is known */
  derived_year_of_study?: 1 | 2 | 3 | 4
}

// ── Main Component ──────────────────────────────────────────────────

export default function CoursesPage() {
  const rawCourses = useCourses()
  const { db, ready, loading, error: dbError, updateCourse, replaceCourses, updateSettings, syncAllCourseFolders } = useDB()

  const degreeStart = useMemo(() => {
    const y = db?.settings?.degree_start_year
    const m = db?.settings?.degree_start_month
    return y && m ? { year: y, month: m } : null
  }, [db?.settings?.degree_start_year, db?.settings?.degree_start_month])

  const courses = useMemo<CourseWithMeta[]>(() => rawCourses.map(c => {
    // If course has a stored year_of_study use it. Otherwise try to derive from
    // academic_year + user's degree_start.
    let yos = c.year_of_study
    if (!yos && c.academic_year && degreeStart) {
      yos = computeYearOfStudy(degreeStart, parseInt(c.academic_year, 10))
    }
    return { ...c, derived_year_of_study: yos }
  }), [rawCourses, degreeStart])

  const [error, setError] = useState<string | null>(null)
  const [editingCourse, setEditingCourse] = useState<CourseWithMeta | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartment, setActiveDepartment] = useState<'הכל' | DepartmentLabel>('הכל')
  const [viewMode, setViewMode] = useState<ViewMode>('year-semester')

  const yearOptions = useMemo(() => guessYearOptions(), [])

  useEffect(() => {
    if (dbError) setError(dbError)
  }, [dbError])

  const handleEditSave = async (updates: {
    title: string
    semester?: SemesterLabel
    academic_year?: string
    year_of_study?: 1 | 2 | 3 | 4
    status: 'active' | 'paused' | 'completed'
    classified_manually: boolean
  }) => {
    if (!editingCourse) return
    const id = editingCourse.id
    setEditingCourse(null)
    try {
      await updateCourse(id, {
        title: updates.title,
        semester: updates.semester,
        academic_year: updates.academic_year,
        year_of_study: updates.year_of_study,
        status: updates.status,
        classified_manually: updates.classified_manually,
      })
    } catch (e) {
      console.error('Failed to save course:', e)
      setError('שגיאה בשמירת הקורס. נסה שוב.')
    }
  }

  const [reclassifying, setReclassifying] = useState(false)
  const [gameOpen, setGameOpen] = useState(false)
  const [syncingFolders, setSyncingFolders] = useState(false)
  const [folderProgress, setFolderProgress] = useState<{ done: number; total: number } | null>(null)
  const [folderResult, setFolderResult] = useState<string | null>(null)

  /** Create/update Drive folder hierarchy for every course. */
  const handleSyncFolders = async () => {
    if (syncingFolders) return
    if (!confirm('ליצור עץ תיקיות ב-Google Drive לכל הקורסים? (SmartDesk/תואר ראשון/שנה X/סמסטר Y/קורס/שיעורים|מטלות|סיכומים)')) return
    setSyncingFolders(true)
    setFolderResult(null)
    setFolderProgress({ done: 0, total: courses.length })
    try {
      const result = await syncAllCourseFolders((done, total) => {
        setFolderProgress({ done, total })
      })
      setFolderResult(
        `הסתיים: ${result.created} נוצרו, ${result.skipped} דולגו, ${result.failed} כשלו`
      )
    } catch (e: any) {
      console.error('Failed to sync folders:', e)
      setError(e?.message || 'יצירת התיקיות ב-Drive נכשלה')
    } finally {
      setSyncingFolders(false)
      setFolderProgress(null)
    }
  }

  /** Bulk: re-run auto-classifier on every non-manually-classified course. */
  const handleReclassifyAll = async (skipConfirm: unknown = false) => {
    if (reclassifying) return
    // `skipConfirm` is called with a MouseEvent when wired directly to onClick
    // (instead of () => ...). Only treat strict boolean `true` as skip-intent.
    if (skipConfirm !== true && !confirm('לסווג מחדש את כל הקורסים הלא-ידניים על פי המטא-דאטה מ-Moodle?')) return
    setReclassifying(true)
    try {
      const next = rawCourses.map((c) => {
        if (c.classified_manually) return c
        const cls = classifyCourse({
          title: c.title,
          shortname: c.shortname,
          moodle_startdate: c.moodle_startdate,
          moodle_enddate: c.moodle_enddate,
        })
        const yos = (degreeStart && cls.academic_year)
          ? computeYearOfStudy(degreeStart, parseInt(cls.academic_year, 10))
          : undefined
        return {
          ...c,
          semester: cls.semester ?? c.semester,
          academic_year: cls.academic_year ?? c.academic_year,
          year_of_study: yos ?? c.year_of_study,
        }
      })
      await replaceCourses(next)
    } catch (e) {
      console.error('Failed to reclassify all:', e)
      setError('שגיאה בסיווג מחדש של הקורסים.')
    } finally {
      setReclassifying(false)
    }
  }

  /** Re-run the auto-classifier on a single course (ignores manual override). */
  const handleReclassify = async (c: CourseWithMeta) => {
    try {
      const cls = classifyCourse({
        title: c.title,
        shortname: c.shortname,
        moodle_startdate: c.moodle_startdate,
        moodle_enddate: c.moodle_enddate,
      })
      const yos = (degreeStart && cls.academic_year)
        ? computeYearOfStudy(degreeStart, parseInt(cls.academic_year, 10))
        : undefined
      await updateCourse(c.id, {
        semester: cls.semester,
        academic_year: cls.academic_year,
        year_of_study: yos,
        classified_manually: false,
      })
    } catch (e) {
      console.error('Failed to reclassify course:', e)
      setError('שגיאה בסיווג מחדש של הקורס.')
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverTarget, setHoverTarget] = useState<string | null>(null)
  const [lastDropCelebration, setLastDropCelebration] = useState<{ x: number; y: number; key: number } | null>(null)

  /** Compute what academic_year corresponds to a given year-of-study, using
   *  the user's degree start. Returns undefined if degreeStart isn't set. */
  const yosToAcademicYear = useCallback((yos: number): string | undefined => {
    if (!degreeStart) return undefined
    const firstAY = degreeStart.month >= 10 ? degreeStart.year : degreeStart.year - 1
    return String(firstAY + yos - 1)
  }, [degreeStart])

  /** Drop a course into (year, semester) — marks classified_manually so
   *  future auto-reclassify won't overwrite the user's choice. */
  const handleDrop = useCallback(async (
    courseId: string,
    targetYos: 1 | 2 | 3 | 4 | null,
    targetSem: Semester | null,
    dropX?: number,
    dropY?: number,
  ) => {
    try {
      const ay = targetYos ? yosToAcademicYear(targetYos) : undefined
      await updateCourse(courseId, {
        year_of_study: targetYos ?? undefined,
        semester: targetSem ?? undefined,
        academic_year: ay,
        classified_manually: true,
      })
      // Tiny celebration at the drop point
      if (dropX != null && dropY != null) {
        setLastDropCelebration({ x: dropX, y: dropY, key: Date.now() })
        setTimeout(() => setLastDropCelebration(null), 800)
      }
    } catch (e) {
      console.error('Failed to move course:', e)
      setError('שגיאה בהזזת הקורס.')
    }
  }, [updateCourse, yosToAcademicYear])

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

  // ── Group courses by year-of-study → semester ─────────────────────
  const grouped = useMemo(() => {
    // yearKey → semKey → courses[]
    const map: Record<string, Record<string, CourseWithMeta[]>> = {}
    const unassigned: CourseWithMeta[] = []

    filteredCourses.forEach((c) => {
      const yos = c.derived_year_of_study
      const sem = c.semester
      if (!yos && !sem) {
        unassigned.push(c)
        return
      }
      const yearKey = yos ? `year-${yos}` : 'no-year'
      const semKey = sem || 'no-sem'
      if (!map[yearKey]) map[yearKey] = {}
      if (!map[yearKey][semKey]) map[yearKey][semKey] = []
      map[yearKey][semKey].push(c)
    })

    // Sort years ascending (year 1 → year 4 → no-year last), showing degree progression
    const yearOrder = (k: string) => {
      if (k === 'no-year') return 99
      return parseInt(k.replace('year-', ''), 10)
    }
    const sortedYears = Object.keys(map).sort((a, b) => yearOrder(a) - yearOrder(b))

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

  // ── Classification progress (for the little game) ────────────────
  const classifiedCount = useMemo(
    () => courses.filter((c) => c.semester && c.derived_year_of_study).length,
    [courses],
  )
  const progressPct = courses.length > 0
    ? Math.round((classifiedCount / courses.length) * 100)
    : 0
  const isComplete = courses.length > 0 && classifiedCount === courses.length

  const semesterOrder: Record<string, number> = { 'א': 1, 'ב': 2, 'קיץ': 3, 'no-sem': 4 }

  // Map year-of-study key → Hebrew label
  const yearLabel = (yearKey: string): string => {
    if (yearKey === 'no-year') return 'ללא שנה'
    const n = parseInt(yearKey.replace('year-', ''), 10)
    const labels = ['', "שנה א'", "שנה ב'", "שנה ג'", "שנה ד'"]
    return labels[n] || `שנה ${n}`
  }

  const semLabelFromKey = (semKey: string): string => {
    if (semKey === 'no-sem') return 'ללא סמסטר'
    if (semKey === 'קיץ') return 'קיץ'
    return `סמסטר ${semKey}'`
  }

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
        <div className="flex items-center gap-3 flex-wrap">
          {/* Create Drive folder hierarchy */}
          {courses.length > 0 && (
            <button
              onClick={handleSyncFolders}
              disabled={syncingFolders}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-ink-muted hover:text-ink hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="צור תיקיות ב-Google Drive לכל הקורסים, מחולקות לפי שנה וסמסטר"
            >
              <FolderTree size={14} className={syncingFolders ? 'animate-pulse' : ''} />
              {syncingFolders && folderProgress
                ? `${folderProgress.done}/${folderProgress.total}`
                : 'צור תיקיות ב-Drive'}
            </button>
          )}
          {/* Reclassify all (only if we have BGU courses with metadata) */}
          {courses.some((c) => c.source === 'bgu' && (c.moodle_startdate || c.shortname)) && (
            <button
              onClick={handleReclassifyAll}
              disabled={reclassifying}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-ink-muted hover:text-ink hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="סווג מחדש את כל הקורסים הלא-ידניים לפי המטא-דאטה מ-Moodle"
            >
              <RefreshCw size={14} className={reclassifying ? 'animate-spin' : ''} />
              {reclassifying ? 'מסווג...' : 'סווג הכל מחדש'}
            </button>
          )}
          {/* Sort-game: only surface if there are unclassified courses */}
          {courses.some((c) => !c.classified_manually && (!c.semester || !c.academic_year)) && (
            <button
              onClick={() => setGameOpen(true)}
              disabled={!degreeStart}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:border-violet-400/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={degreeStart ? 'סדר את הקורסים שלא סווגו אוטומטית' : 'הגדר תחילה מתי התחלת את התואר בהגדרות'}
            >
              <Gamepad2 size={14} />
              סדר ידני (משחק)
            </button>
          )}
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

      {/* Folder sync result banner */}
      {folderResult && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderTree size={16} />
            <span>{folderResult}</span>
          </div>
          <button
            onClick={() => setFolderResult(null)}
            className="text-xs text-emerald-300/70 hover:text-emerald-200"
          >
            סגור
          </button>
        </div>
      )}

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
          {/* Inline degree-start setter when not configured */}
          {!degreeStart && courses.length > 0 && (
            <DegreeStartBanner
              onSave={async (year, month) => {
                await updateSettings({ degree_start_year: year, degree_start_month: month })
                // Auto-reclassify once the degree start is known so year-of-study
                // gets computed for all existing courses in one click.
                await handleReclassifyAll(true)
              }}
            />
          )}

          {/* Progress meter — visual "game" of organizing courses */}
          {courses.length > 0 && (
            <ProgressMeter
              classified={classifiedCount}
              total={courses.length}
              pct={progressPct}
              isComplete={isComplete}
            />
          )}

          {/* Quick palette — floating drop targets for every year × semester.
              Expands into a grid while a card is being dragged so the user
              can drop onto any bucket (even empty ones). */}
          {courses.length > 0 && (
            <QuickPalette
              degreeStart={degreeStart}
              isDragging={!!draggingId}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              onDrop={(yos, sem, e) => {
                if (!draggingId) return
                handleDrop(draggingId, yos, sem, e.clientX, e.clientY)
                setDraggingId(null)
                setHoverTarget(null)
              }}
            />
          )}

          {/* Grouped courses by year-of-study / semester */}
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
                    <h2 className="text-lg font-bold text-ink">{yearLabel(yearKey)}</h2>
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
                    const targetYos = yearKey === 'no-year' ? null : (parseInt(yearKey.replace('year-', ''), 10) as 1 | 2 | 3 | 4)
                    const targetSem = semKey === 'no-sem' ? null : (semKey as Semester)
                    const dropKey = `drop-${yearKey}-${semKey}`
                    const isHover = hoverTarget === dropKey

                    return (
                      <motion.div
                        key={semKey}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div
                          className={`mr-4 border-r border-white/5 pr-4 space-y-3 pb-2 rounded-lg transition-all ${
                            isHover ? 'bg-indigo-500/10 ring-2 ring-indigo-500/50' : ''
                          } ${draggingId ? 'ring-1 ring-white/5' : ''}`}
                          onDragOver={(e) => {
                            if (!draggingId) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            setHoverTarget(dropKey)
                          }}
                          onDragLeave={(e) => {
                            // Only clear when leaving the container itself, not children
                            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                              setHoverTarget(prev => prev === dropKey ? null : prev)
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (!draggingId) return
                            handleDrop(draggingId, targetYos, targetSem, e.clientX, e.clientY)
                            setDraggingId(null)
                            setHoverTarget(null)
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Tag size={14} className="text-violet-400" />
                            <h3 className="text-sm font-semibold text-ink-muted">{semLabelFromKey(semKey)}</h3>
                            <span className="text-xs text-ink-subtle">({semCourses.length})</span>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-3">
                            {semCourses.map((course) => (
                              <CourseCard
                                key={course.id}
                                course={course}
                                isDragging={draggingId === course.id}
                                onDragStart={() => setDraggingId(course.id)}
                                onDragEnd={() => { setDraggingId(null); setHoverTarget(null) }}
                                onEdit={() => setEditingCourse(course)}
                                onReclassify={() => handleReclassify(course)}
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

          {/* Unassigned courses — also a drop zone */}
          {grouped.unassigned.length > 0 && (() => {
            const dropKey = 'drop-unassigned'
            const isHover = hoverTarget === dropKey
            return (
              <div
                className={`space-y-3 rounded-lg transition-all p-3 -m-3 ${
                  isHover ? 'bg-amber-500/10 ring-2 ring-amber-500/50' : ''
                }`}
                onDragOver={(e) => {
                  if (!draggingId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setHoverTarget(dropKey)
                }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                    setHoverTarget(prev => prev === dropKey ? null : prev)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (!draggingId) return
                  handleDrop(draggingId, null, null, e.clientX, e.clientY)
                  setDraggingId(null)
                  setHoverTarget(null)
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <BookOpen size={16} className="text-amber-400" />
                  </div>
                  <h2 className="text-lg font-bold text-ink">לא משויכים</h2>
                  <span className="text-xs text-ink-muted">{grouped.unassigned.length} קורסים</span>
                </div>
                <p className="text-xs text-ink-subtle mr-11">
                  גרור קורס לדלי אחר כדי לסווג, או לחץ על העיפרון לעריכה ידנית
                </p>
                <div className="grid sm:grid-cols-2 gap-3 mr-4">
                  {grouped.unassigned.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      isDragging={draggingId === course.id}
                      onDragStart={() => setDraggingId(course.id)}
                      onDragEnd={() => { setDraggingId(null); setHoverTarget(null) }}
                      onEdit={() => setEditingCourse(course)}
                      onReclassify={() => handleReclassify(course)}
                    />
                  ))}
                </div>
              </div>
            )
          })()}
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
                            isDragging={draggingId === course.id}
                            onDragStart={() => setDraggingId(course.id)}
                            onDragEnd={() => { setDraggingId(null); setHoverTarget(null) }}
                            onEdit={() => setEditingCourse(course)}
                            onReclassify={() => handleReclassify(course)}
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
        onReclassify={async (c) => {
          setEditingCourse(null)
          await handleReclassify(c)
        }}
        yearOptions={yearOptions}
        degreeStart={degreeStart}
      />

      {/* Drop celebration burst */}
      <AnimatePresence>
        {lastDropCelebration && (
          <motion.div
            key={lastDropCelebration.key}
            initial={{ opacity: 1, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.8, y: -40 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="fixed pointer-events-none z-50 text-2xl"
            style={{ left: lastDropCelebration.x - 12, top: lastDropCelebration.y - 12 }}
          >
            ✨
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual sorting game */}
      <AnimatePresence>
        {gameOpen && (
          <CourseSortingGame
            courses={courses.filter(c => !c.classified_manually && (!c.semester || !c.academic_year))}
            degreeStart={degreeStart}
            onClose={() => setGameOpen(false)}
            onClassify={async (id, updates) => {
              await updateCourse(id, updates)
            }}
          />
        )}
      </AnimatePresence>
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
  onReclassify,
  yearOptions,
  degreeStart,
}: {
  course: CourseWithMeta | null
  onClose: () => void
  onSave: (updates: {
    title: string
    semester?: SemesterLabel
    academic_year?: string
    year_of_study?: 1 | 2 | 3 | 4
    status: 'active' | 'paused' | 'completed'
    classified_manually: boolean
  }) => void
  onReclassify: (c: CourseWithMeta) => Promise<void>
  yearOptions: { value: string; label: string }[]
  degreeStart: { year: number; month: number } | null
}) {
  const [localTitle, setLocalTitle] = useState('')
  const [localSem, setLocalSem] = useState<SemesterLabel | ''>('')
  const [localAY, setLocalAY] = useState('')
  const [localStatus, setLocalStatus] = useState<'active' | 'paused' | 'completed'>('active')

  // Sync local state when a new course is opened for editing
  useEffect(() => {
    if (course) {
      setLocalTitle(course.title)
      setLocalSem(course.semester || '')
      setLocalAY(course.academic_year || '')
      setLocalStatus(course.status || 'active')
    }
  }, [course])

  const handleSave = () => {
    // Compute year_of_study from AY if possible
    const yos = (degreeStart && localAY)
      ? computeYearOfStudy(degreeStart, parseInt(localAY, 10))
      : undefined

    // If user changed semester or academic year from what classifier produced,
    // mark as manual override so future auto-reclassify skips it.
    const originalSem = course?.semester || ''
    const originalAY = course?.academic_year || ''
    const changedClassification =
      (localSem || '') !== originalSem || (localAY || '') !== originalAY
    const manual = course?.classified_manually || changedClassification

    onSave({
      title: localTitle,
      semester: localSem || undefined,
      academic_year: localAY || undefined,
      year_of_study: yos,
      status: localStatus,
      classified_manually: manual,
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
              value={localAY}
              onChange={(e) => setLocalAY(e.target.value)}
              className="w-full text-sm bg-[#1e2330] border border-white/10 rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-indigo-500/50 transition-colors"
            >
              <option value="" className="bg-[#1e2330] text-gray-300">לא נבחר</option>
              {yearOptions.map((y) => (
                <option key={y.value} value={y.value} className="bg-[#1e2330] text-gray-300">{y.label}</option>
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

        {/* Year-of-study preview */}
        {localAY && degreeStart && (() => {
          const yos = computeYearOfStudy(degreeStart, parseInt(localAY, 10))
          if (!yos) return null
          return (
            <p className="text-xs text-ink-subtle">
              {semesterLabel(yos, localSem || undefined)}
            </p>
          )
        })()}

        {/* Re-classify button (only if we have metadata to classify from) */}
        {course && (course.moodle_startdate || course.shortname) && (
          <button
            onClick={() => onReclassify(course)}
            className="w-full text-xs px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-indigo-300 hover:bg-indigo-500/10 transition-colors flex items-center justify-center gap-2"
          >
            <Calendar size={14} />
            סווג מחדש אוטומטית ממטא-דאטה של מודל
          </button>
        )}
        {course?.classified_manually && (
          <p className="text-xs text-amber-400/80 text-center">
            ⚠ סיווג ידני פעיל — סיווג אוטומטי יתעלם מקורס זה
          </p>
        )}

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
  onReclassify,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  course: CourseWithMeta
  onEdit: () => void
  onReclassify?: () => void
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const router = useRouter()

  // Show "סווג מחדש" only for unclassified courses that have metadata and no manual override
  const canAutoClassify =
    !course.classified_manually &&
    (course.moodle_startdate || course.shortname) &&
    (!course.semester || !course.academic_year)

  // Click fires only if no drag happened (HTML5 DnD swallows clicks that ended as drops)
  const handleClick = (e: React.MouseEvent) => {
    // Ignore clicks originating from inside interactive children (links/buttons)
    const target = e.target as HTMLElement
    if (target.closest('button, a[href]')) return
    router.push(`/courses/${course.id}`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', course.id) } catch {}
        onDragStart?.()
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/courses/${course.id}`) }}
      className={`block group cursor-grab active:cursor-grabbing select-none transition-opacity ${
        isDragging ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <GlowCard className="group-hover:scale-[1.01] transition-transform">
        <div className="p-4 space-y-2 relative">
          {/* Drag handle hint — visible on hover */}
          <GripVertical
            size={14}
            className="absolute top-2 right-2 text-ink-subtle/30 group-hover:text-ink-subtle transition-colors pointer-events-none"
          />
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-ink leading-snug line-clamp-2 flex-1 group-hover:text-indigo-300 transition-colors">
              {course.title}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {course.drive_folder_ids?.course && (
                <a
                  href={`https://drive.google.com/drive/folders/${course.drive_folder_ids.course}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`https://drive.google.com/drive/folders/${course.drive_folder_ids!.course}`, '_blank', 'noopener,noreferrer') }}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors"
                  title="פתח את תיקיית הקורס ב-Drive"
                >
                  <FolderTree size={14} />
                </a>
              )}
              {canAutoClassify && onReclassify && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReclassify() }}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors"
                  title="סווג מחדש אוטומטית"
                >
                  <Calendar size={14} />
                </button>
              )}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit() }}
                className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors"
                title="ערוך קורס"
              >
                <Pencil size={14} />
              </button>
            </div>
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
                onClick={(e) => e.stopPropagation()}
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
    </div>
  )
}

// ── Degree Start Banner ─────────────────────────────────────────────
// Inline setter for degree_start_year / degree_start_month. Shown at the top
// of /courses when the user hasn't configured their degree start date yet.
// Used so the user can turn the "לא משויכים" bucket into real year-of-study
// buckets without leaving the page.

function DegreeStartBanner({
  onSave,
}: {
  onSave: (year: number, month: number) => Promise<void>
}) {
  const now = new Date()
  // Default to the current academic year: if we're in Oct-Dec, current year;
  // otherwise previous year. Default month = October.
  const defaultYear = now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1
  const [year, setYear] = useState<number>(defaultYear)
  const [month, setMonth] = useState<number>(10)
  const [saving, setSaving] = useState(false)

  const yearOptions: number[] = []
  for (let y = defaultYear + 1; y >= defaultYear - 6; y--) yearOptions.push(y)

  const monthOptions: { value: number; label: string }[] = [
    { value: 10, label: 'אוקטובר (סמסטר א׳)' },
    { value: 3, label: 'מרץ (סמסטר ב׳)' },
    { value: 7, label: 'יולי (קיץ)' },
  ]

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(year, month)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300/90 space-y-3">
      <div className="flex items-start gap-3">
        <Calendar size={16} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium">הגדר את תאריך תחילת התואר</p>
          <p className="text-xs text-amber-300/70 mt-0.5">
            כדי שנסדר את הקורסים לפי שנת לימוד (שנה א׳/ב׳/ג׳/ד׳). הזן את הסמסטר הראשון שלך בתואר:
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 pr-7">
        <div className="space-y-1">
          <label className="text-xs text-amber-300/70">שנה</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="w-full text-sm bg-[#1e2330] border border-white/10 rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-amber-500/50"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} className="bg-[#1e2330] text-gray-300">
                {y}/{y + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-amber-300/70">סמסטר התחלה</label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="w-full text-sm bg-[#1e2330] border border-white/10 rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-amber-500/50"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value} className="bg-[#1e2330] text-gray-300">
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'שומר ומסווג...' : 'שמור וסווג קורסים'}
        </button>
        <Link
          href="/settings"
          className="text-xs text-amber-300/60 underline hover:text-amber-200 pb-2"
        >
          עריכה מפורטת
        </Link>
      </div>
    </div>
  )
}

// ── Progress Meter ──────────────────────────────────────────────────
// Shows "X/N מסווגים" with a gradient bar. Celebrates at 100%.

function ProgressMeter({
  classified,
  total,
  pct,
  isComplete,
}: {
  classified: number
  total: number
  pct: number
  isComplete: boolean
}) {
  return (
    <div className={`rounded-xl p-3 border transition-colors ${
      isComplete
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-white/[0.02] border-white/[0.06]'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <Trophy size={16} className="text-emerald-400" />
          ) : (
            <Sparkles size={16} className="text-indigo-400" />
          )}
          <span className="text-sm text-ink">
            {isComplete ? 'הכל מסודר! 🎉' : 'סידור קורסים'}
          </span>
        </div>
        <span className={`text-xs tabular-nums ${
          isComplete ? 'text-emerald-400' : 'text-ink-muted'
        }`}>
          {classified}/{total} מסווגים
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{
            background: isComplete
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)',
          }}
        />
      </div>
      {!isComplete && total > 0 && (
        <p className="text-[11px] text-ink-subtle mt-1.5">
          גרור קורס לדלי כדי לסווג אותו לשנה וסמסטר
        </p>
      )}
    </div>
  )
}

// ── Quick Palette ───────────────────────────────────────────────────
// Floating grid of drop targets for every year × semester combination.
// Dormant (small pills) by default; expands to full grid while dragging
// so the user can drop onto empty buckets that don't exist yet in the view.

function QuickPalette({
  degreeStart,
  isDragging,
  hoverTarget,
  setHoverTarget,
  onDrop,
}: {
  degreeStart: { year: number; month: number } | null
  isDragging: boolean
  hoverTarget: string | null
  setHoverTarget: (k: string | null) => void
  onDrop: (yos: 1 | 2 | 3 | 4 | null, sem: Semester | null, e: React.DragEvent) => void
}) {
  // Only show the expanded grid during a drag — otherwise it's just clutter
  if (!isDragging) return null

  const years: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]
  const semesters: Semester[] = ['א', 'ב', 'קיץ']
  const yearLabels = ['', "שנה א'", "שנה ב'", "שנה ג'", "שנה ד'"]

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="sticky top-2 z-40 rounded-2xl bg-bg-surface/95 backdrop-blur-xl border border-indigo-500/30 p-3 shadow-2xl shadow-indigo-500/10"
    >
      <p className="text-xs text-indigo-300 mb-2 flex items-center gap-1.5">
        <Sparkles size={12} />
        שחרר על דלי כדי לסווג
      </p>
      <div className="grid grid-cols-3 gap-2">
        {years.map((yos) => (
          <div key={yos} className="space-y-2">
            <div className="text-[11px] text-ink-muted font-semibold">{yearLabels[yos]}</div>
            <div className="grid grid-cols-3 gap-1">
              {semesters.map((sem) => {
                const key = `palette-${yos}-${sem}`
                const isHover = hoverTarget === key
                return (
                  <button
                    key={sem}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setHoverTarget(key)
                    }}
                    onDragLeave={(e) => {
                      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                        setHoverTarget(null)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      onDrop(yos, sem, e)
                    }}
                    className={`text-xs py-2 rounded-lg border transition-all ${
                      isHover
                        ? 'bg-indigo-500/30 border-indigo-400 text-white scale-105 ring-2 ring-indigo-500/50'
                        : 'bg-white/5 border-white/10 text-ink-muted hover:bg-white/10'
                    }`}
                    title={`${yearLabels[yos]} ${sem === 'קיץ' ? 'קיץ' : `סמסטר ${sem}'`}${
                      !degreeStart ? ' (ללא שנה אקדמית כי לא הוגדר תאריך תחילת תואר)' : ''
                    }`}
                  >
                    {sem === 'קיץ' ? '☀️' : sem === 'א' ? 'א' : 'ב'}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {/* Unassigned row */}
      <button
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setHoverTarget('palette-none')
        }}
        onDragLeave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
            setHoverTarget(null)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDrop(null, null, e)
        }}
        className={`mt-2 w-full text-xs py-1.5 rounded-lg border transition-all ${
          hoverTarget === 'palette-none'
            ? 'bg-amber-500/20 border-amber-400 text-amber-100'
            : 'bg-white/5 border-white/10 text-ink-muted hover:bg-white/10'
        }`}
      >
        לא משויכים (בטל סיווג)
      </button>
    </motion.div>
  )
}
