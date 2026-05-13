'use client'

/**
 * /summaries (המוח) — Drive folder explorer.
 *
 * The tree mirrors the user's TEEPO/ hierarchy in their Drive and grows
 * down as the user drills in:
 *
 *   TEEPO ─┐
 *          └─ <University> ─┐
 *                            └─ Semester chips ─┐ (one selected)
 *                                                └─ Course chips ─┐ (one selected)
 *                                                                  └─ Folder chips (lessons/assignments/notes)
 *
 * The panel below the tree shows the contents of the deepest selection:
 *   - At semester level   → list of course tiles in that semester
 *   - At course level     → 3 folder-overview tiles with live file counts
 *   - At folder level     → the real Drive file list with upload + delete
 *
 * State invariant: selecting a level resets all deeper selections so the
 * tree never shows a node that lost its parent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Folder, BookOpen, FileText, StickyNote, Mic,
  GraduationCap, Brain, ChevronLeft, Home,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { useUniversityName } from '@/lib/use-university'
import { FolderSection } from '@/components/summaries/CourseDrivePanel'
import { useDriveFiles } from '@/lib/use-drive-files'
import type { Course } from '@/types'

type HebSemester = 'א' | 'ב' | 'קיץ'

interface SemesterBucket {
  key: string
  label: string
  year: number              // 0 for unclassified
  semester: HebSemester | null
  courses: Course[]
  isUnclassified: boolean
}

type FolderKind = 'lessons' | 'assignments' | 'notes'

const SEM_ORDER: Record<HebSemester, number> = { 'א': 1, 'ב': 2, 'קיץ': 3 }

/** Group courses into semester buckets. Unclassified courses get their own
 *  bucket at the end so the user can find and fix them. */
function bucketize(courses: Course[]): SemesterBucket[] {
  const map = new Map<string, SemesterBucket>()
  for (const c of courses) {
    const sem = c.semester
    if (!sem) {
      const k = 'unclassified'
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          label: 'לא מסווגים',
          year: 0,
          semester: null,
          courses: [],
          isUnclassified: true,
        })
      }
      map.get(k)!.courses.push(c)
      continue
    }
    const year = c.academic_year ? parseInt(c.academic_year, 10) : 0
    const yearLabel = year ? `${year}/${(year + 1).toString().slice(-2)} · ` : ''
    const semLabel = sem === 'קיץ' ? 'קיץ' : `סמסטר ${sem}׳`
    const key = `${year}-${sem}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: `${yearLabel}${semLabel}`,
        year,
        semester: sem,
        courses: [],
        isUnclassified: false,
      })
    }
    map.get(key)!.courses.push(c)
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.isUnclassified) return 1
    if (b.isUnclassified) return -1
    if (a.year !== b.year) return b.year - a.year
    const aOrd = a.semester ? SEM_ORDER[a.semester] : 9
    const bOrd = b.semester ? SEM_ORDER[b.semester] : 9
    return aOrd - bOrd
  })
}

const FOLDER_DEFS: Array<{ kind: FolderKind; label: string; hint: string; Icon: any }> = [
  { kind: 'lessons',     label: 'שיעורים',  hint: 'הרצאות, תרגולים, מצגות',        Icon: Mic },
  { kind: 'assignments', label: 'מטלות',    hint: 'תרגילים, פרויקטים, בחנים',      Icon: Folder },
  { kind: 'notes',       label: 'סיכומים', hint: 'הסיכומים האישיים שלך',           Icon: StickyNote },
]

const COURSE_PALETTE = [
  { color: '#8b5cf6', soft: '#ede9fe' },
  { color: '#d97706', soft: '#fef3c7' },
  { color: '#0d9488', soft: '#ccfbf1' },
  { color: '#6366f1', soft: '#e0e7ff' },
  { color: '#e11d48', soft: '#fce7f3' },
  { color: '#16a34a', soft: '#dcfce7' },
]

export default function SummariesPage() {
  const { db, syncCourseFolders } = useDB() as any
  const universityName = useUniversityName()
  // Prefer the user's named degree (e.g. "תואר ראשון - מנע״ס") over the
  // generic university label. Falls back to university → 'התואר שלי' so
  // the tree never renders a blank node for users who haven't filled it in.
  const degreeLabel: string =
    (db?.settings?.degree_name && String(db.settings.degree_name).trim()) ||
    universityName ||
    'התואר שלי'

  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const buckets = useMemo(() => bucketize(courses), [courses])

  const [activeSem, setActiveSem] = useState<string | null>(null)
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [activeFolderKind, setActiveFolderKind] = useState<FolderKind | null>(null)

  // First load: snap to the first bucket if the user hasn't picked yet.
  useEffect(() => {
    if (!activeSem && buckets.length > 0) {
      setActiveSem(buckets[0].key)
    }
  }, [buckets, activeSem])

  const activeBucket = useMemo(
    () => buckets.find((b) => b.key === activeSem) ?? null,
    [buckets, activeSem],
  )
  const activeCourse = useMemo(
    () => activeBucket?.courses.find((c) => c.id === activeCourseId) ?? null,
    [activeBucket, activeCourseId],
  )

  // Selection handlers reset deeper levels so we never show an orphan node.
  const pickSem = useCallback((key: string) => {
    setActiveSem(key)
    setActiveCourseId(null)
    setActiveFolderKind(null)
  }, [])
  const pickCourse = useCallback((id: string) => {
    setActiveCourseId((prev) => (prev === id ? null : id))
    setActiveFolderKind(null)
  }, [])
  const pickFolder = useCallback((kind: FolderKind) => {
    setActiveFolderKind((prev) => (prev === kind ? null : kind))
  }, [])

  // Auto-heal: missing drive_folder_ids on the visible courses get one
  // provision attempt per courseId per tab. Same logic as before — moved
  // up here so we can still hit it after the structural rewrite.
  const provisionedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!activeBucket || typeof syncCourseFolders !== 'function') return
    for (const c of activeBucket.courses) {
      const hasIds = Boolean((c as any).drive_folder_ids?.course)
      if (hasIds) continue
      if (provisionedRef.current.has(c.id)) continue
      provisionedRef.current.add(c.id)
      syncCourseFolders(c.id).catch((e: unknown) => {
        console.warn('[summaries] auto-provision failed for', c.title, e)
      })
    }
  }, [activeBucket, syncCourseFolders])

  return (
    <div className="cream-page summaries-page">
      <main className="sum-main">

        <header className="sum-head">
          <div className="sum-eyebrow">המוח</div>
          <h1 className="sum-h1">
            הסיכומים <span className="accent">שלי</span>.
          </h1>
          <p className="sum-sub">
            תצוגת ה-Drive האישי שלך. בחר סמסטר → קורס → תיקייה כדי לראות את הקבצים.
          </p>
        </header>

        {/* ===== Tree — TEEPO → degree → semester → course → folder ===== */}
        <div className="tree-wrap">
          <div className="tree-root">
            <button
              type="button"
              className="node root"
              onClick={() => { setActiveSem(buckets[0]?.key ?? null); setActiveCourseId(null); setActiveFolderKind(null) }}
              title="חזור לתצוגת כל הסמסטרים"
            >
              <Home className="folder-ico" />
              <span className="name">TEEPO</span>
              <span className="count">{courses.length}</span>
            </button>
          </div>

          <div className="degree-header">
            <div className="degree-to-sems" />
            <div className="node degree">
              <GraduationCap className="folder-ico" />
              <span className="name">{degreeLabel}</span>
              <span className="count">{buckets.length} סמסטרים</span>
            </div>
          </div>

          {buckets.length > 0 && (
            <div className="sem-grid">
              {buckets.map((b) => (
                <div className={`sem-chip-wrap ${b.key === activeSem ? 'active' : ''}`} key={b.key}>
                  <button
                    type="button"
                    className={`node sem ${b.key === activeSem ? 'active' : ''}`}
                    onClick={() => pickSem(b.key)}
                  >
                    <Folder className="folder-ico" />
                    <span className="name">{b.label}</span>
                    <span className="count">{b.courses.length}</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Course row — appears only when a semester is selected */}
          {activeBucket && activeBucket.courses.length > 0 && (
            <>
              <div className="tree-divider-line" aria-hidden />
              <div className="course-row">
                {activeBucket.courses.map((c, i) => {
                  const palette = COURSE_PALETTE[i % COURSE_PALETTE.length]
                  const isActive = c.id === activeCourseId
                  return (
                    <button
                      type="button"
                      key={c.id}
                      className={`node course ${isActive ? 'active' : ''}`}
                      onClick={() => pickCourse(c.id)}
                      style={{ ['--course-color' as any]: palette.color, ['--course-soft' as any]: palette.soft }}
                    >
                      <BookOpen className="folder-ico" />
                      <span className="name">{c.title}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Folder row — appears only when a course is selected */}
          {activeCourse && (
            <>
              <div className="tree-divider-line" aria-hidden />
              <div className="folder-row-tree">
                {FOLDER_DEFS.map(({ kind, label, Icon }) => {
                  const isActive = activeFolderKind === kind
                  return (
                    <button
                      type="button"
                      key={kind}
                      className={`node folder ${isActive ? 'active' : ''}`}
                      onClick={() => pickFolder(kind)}
                    >
                      <Icon className="folder-ico" />
                      <span className="name">{label}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* ===== Below-tree panel: contents of the deepest selection ===== */}
        {activeCourse && activeFolderKind ? (
          <FolderContentsPanel
            course={activeCourse}
            kind={activeFolderKind}
            onBack={() => setActiveFolderKind(null)}
          />
        ) : activeCourse ? (
          <CourseFolderOverviewPanel
            course={activeCourse}
            onPickFolder={pickFolder}
            onBack={() => setActiveCourseId(null)}
          />
        ) : activeBucket ? (
          <SemesterCoursesPanel
            bucket={activeBucket}
            onPickCourse={pickCourse}
          />
        ) : (
          <div className="sum-empty">
            <Folder />
            <h3>בחר סמסטר כדי להתחיל</h3>
          </div>
        )}

      </main>
    </div>
  )
}

// ── Below-tree panels ──────────────────────────────────────────────────

function SemesterCoursesPanel({
  bucket,
  onPickCourse,
}: {
  bucket: SemesterBucket
  onPickCourse: (id: string) => void
}) {
  const { reclassifyCourse } = useDB() as any
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkYear, setBulkYear] = useState<number | ''>('')
  const [bulkSem, setBulkSem] = useState<HebSemester | ''>('')
  const [bulkStatus, setBulkStatus] = useState<{ done: number; total: number; failed: number } | null>(null)
  const [bulkErr, setBulkErr] = useState<string | null>(null)

  // Clear selection when the bucket changes (user navigated away and back).
  useEffect(() => {
    setSelectedIds(new Set())
    setBulkStatus(null)
    setBulkErr(null)
  }, [bucket.key])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(bucket.courses.map(c => c.id)))
  }, [bucket.courses])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const canApply =
    selectedIds.size > 0 &&
    (bulkYear !== '' || bulkSem !== '') &&
    bulkStatus === null

  const applyBulk = async () => {
    if (!canApply || typeof reclassifyCourse !== 'function') return
    const ids = Array.from(selectedIds)
    setBulkErr(null)
    setBulkStatus({ done: 0, total: ids.length, failed: 0 })
    let failed = 0
    let firstError: string | null = null
    for (let i = 0; i < ids.length; i++) {
      try {
        await reclassifyCourse(ids[i], {
          year_of_study: (bulkYear || undefined) as Course['year_of_study'],
          semester: (bulkSem || undefined) as Course['semester'],
        })
      } catch (e: any) {
        failed++
        if (!firstError) firstError = e?.message || 'שגיאה'
        console.warn('[bulk-classify] failed for', ids[i], e)
      }
      setBulkStatus({ done: i + 1, total: ids.length, failed })
    }
    if (firstError) setBulkErr(firstError)
    // Clear selection on success; the now-classified courses move out of this
    // bucket anyway, so keeping them selected is meaningless.
    if (failed === 0) setSelectedIds(new Set())
    // Hide progress after a short delay so success message has time to be seen.
    setTimeout(() => setBulkStatus(null), 2500)
  }

  if (bucket.courses.length === 0) {
    return (
      <section className="course-panel">
        <div className="course-panel-head">
          <div className="course-panel-icon"><Brain /></div>
          <div className="meta">
            <div className="crumb">{bucket.label}</div>
            <h2>אין עוד קורסים בסמסטר הזה</h2>
          </div>
        </div>
        <div className="empty-state">
          <Folder />
          <p>חברו את ה-Moodle או הוסיפו קורס ידנית כדי שהמוח שלכם יתמלא.</p>
        </div>
      </section>
    )
  }

  const allSelected = selectedIds.size === bucket.courses.length
  const someSelected = selectedIds.size > 0

  return (
    <section className="course-panel">
      <div className="course-panel-head">
        <div className="course-panel-icon"><Brain /></div>
        <div className="meta">
          <div className="crumb">{bucket.label}</div>
          <h2>הקורסים של הסמסטר</h2>
        </div>
        <span className="count-pill">{bucket.courses.length} קורסים</span>
      </div>

      {/* Bulk classify toolbar — sticky above the grid */}
      <div className="bulk-bar">
        <div className="bulk-bar-left">
          <label className="bulk-checkbox">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={() => (allSelected ? clearSelection() : selectAll())}
            />
            <span>בחר הכל</span>
          </label>
          <span className="bulk-count">
            {selectedIds.size > 0 ? `נבחרו ${selectedIds.size}` : 'בחר קורסים לסיווג קבוצתי'}
          </span>
        </div>
        <div className="bulk-bar-right">
          <select
            className="bulk-select"
            value={bulkYear}
            onChange={(e) => setBulkYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            disabled={!someSelected || bulkStatus !== null}
            aria-label="שנה"
          >
            <option value="">שנה —</option>
            {YEAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            className="bulk-select"
            value={bulkSem}
            onChange={(e) => setBulkSem(e.target.value as HebSemester | '')}
            disabled={!someSelected || bulkStatus !== null}
            aria-label="סמסטר"
          >
            <option value="">סמסטר —</option>
            {SEMESTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            type="button"
            className="bulk-apply"
            onClick={applyBulk}
            disabled={!canApply}
          >
            {bulkStatus
              ? `מסדר… ${bulkStatus.done}/${bulkStatus.total}`
              : `סדר ב-Drive (${selectedIds.size})`}
          </button>
        </div>
      </div>
      {bulkErr && <div className="bulk-error">שגיאה ראשונה: {bulkErr}</div>}
      {bulkStatus && bulkStatus.done === bulkStatus.total && !bulkErr && (
        <div className="bulk-success">
          {bulkStatus.total - bulkStatus.failed} קורסים סודרו ב-Drive
          {bulkStatus.failed > 0 ? ` · ${bulkStatus.failed} נכשלו` : ''}
        </div>
      )}

      <div className="course-grid">
        {bucket.courses.map((c, i) => {
          const palette = COURSE_PALETTE[i % COURSE_PALETTE.length]
          const isSelected = selectedIds.has(c.id)
          return (
            <div
              key={c.id}
              className={`course-card ${isSelected ? 'course-card-selected' : ''}`}
              style={{ ['--course-color' as any]: palette.color, ['--course-soft' as any]: palette.soft }}
            >
              <label
                className="course-card-pick"
                onClick={(e) => e.stopPropagation()}
                title="בחר לסיווג קבוצתי"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(c.id)}
                />
              </label>
              <button
                type="button"
                className="course-card-body"
                onClick={() => onPickCourse(c.id)}
              >
                <div className="top">
                  <div className="ico-wrap"><BookOpen /></div>
                  <div>
                    <h3>{c.title}</h3>
                    <small>{(c as any).shortname ?? ''}</small>
                  </div>
                </div>
                <div className="folder-shortcut-row">
                  <span>פתח →</span>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CourseFolderOverviewPanel({
  course,
  onPickFolder,
  onBack,
}: {
  course: Course
  onPickFolder: (k: FolderKind) => void
  onBack: () => void
}) {
  const folderIds = (course as any).drive_folder_ids ?? null
  return (
    <section className="course-panel">
      <div className="course-panel-head">
        <button type="button" className="back-pill" onClick={onBack} aria-label="חזרה לסמסטר">
          <ChevronLeft size={16} />
        </button>
        <div className="course-panel-icon"><BookOpen /></div>
        <div className="meta">
          <div className="crumb">{course.title}</div>
          <h2>תיקיות הקורס</h2>
        </div>
        <Link href={`/courses/${course.id}`} className="count-pill" style={{ textDecoration: 'none' }}>
          פתח קורס →
        </Link>
      </div>

      <ClassifyWidget course={course} />

      {!folderIds?.course ? (
        <div className="empty-state">
          <Folder />
          <p>התיקיות עוד לא נוצרו ב-Drive. סווג את הקורס למעלה כדי שייווצרו אוטומטית.</p>
        </div>
      ) : (
        <div className="folder-overview-grid">
          {FOLDER_DEFS.map(({ kind, label, hint, Icon }) => (
            <button
              type="button"
              key={kind}
              className="folder-overview-card"
              onClick={() => onPickFolder(kind)}
            >
              <div className="folder-overview-icon"><Icon /></div>
              <div className="folder-overview-body">
                <h3>{label}</h3>
                <small>{hint}</small>
              </div>
              <ChevronLeft className="folder-overview-arrow" size={18} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

const SEMESTER_OPTIONS: Array<{ value: HebSemester; label: string }> = [
  { value: 'א', label: "סמסטר א'" },
  { value: 'ב', label: "סמסטר ב'" },
  { value: 'קיץ', label: 'קיץ' },
]
const YEAR_OPTIONS: Array<{ value: 1 | 2 | 3 | 4; label: string }> = [
  { value: 1, label: "שנה א'" },
  { value: 2, label: "שנה ב'" },
  { value: 3, label: "שנה ג'" },
  { value: 4, label: "שנה ד'" },
]

/** Inline classify form — set שנה + סמסטר for this course; on save we MOVE
 *  the existing Drive folder to the new path (or create fresh if it never had one). */
function ClassifyWidget({ course }: { course: Course }) {
  const { reclassifyCourse } = useDB() as any
  const [semester, setSemester] = useState<HebSemester | ''>(course.semester ?? '')
  const [yearOfStudy, setYearOfStudy] = useState<number | ''>(course.year_of_study ?? '')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Re-sync local state when the user navigates between courses.
  useEffect(() => {
    setSemester(course.semester ?? '')
    setYearOfStudy(course.year_of_study ?? '')
    setStatus(null)
  }, [course.id, course.semester, course.year_of_study])

  const dirty =
    semester !== (course.semester ?? '') ||
    yearOfStudy !== (course.year_of_study ?? '')
  const canSave = dirty && !busy && (semester !== '' || yearOfStudy !== '')

  const onSave = async () => {
    if (!canSave) return
    setBusy(true)
    setStatus(null)
    try {
      await reclassifyCourse(course.id, {
        semester: semester || undefined,
        year_of_study: (yearOfStudy || undefined) as Course['year_of_study'],
      })
      setStatus({ kind: 'ok', text: 'נשמר וסודר ב-Drive' })
    } catch (e: any) {
      setStatus({ kind: 'err', text: e?.message || 'שגיאה בשמירה' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="classify-widget">
      <div className="classify-row">
        <div className="classify-field">
          <label htmlFor={`yos-${course.id}`}>שנה</label>
          <select
            id={`yos-${course.id}`}
            value={yearOfStudy}
            onChange={(e) => setYearOfStudy(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            disabled={busy}
          >
            <option value="">—</option>
            {YEAR_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="classify-field">
          <label htmlFor={`sem-${course.id}`}>סמסטר</label>
          <select
            id={`sem-${course.id}`}
            value={semester}
            onChange={(e) => setSemester(e.target.value as HebSemester | '')}
            disabled={busy}
          >
            <option value="">—</option>
            {SEMESTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="classify-save"
          onClick={onSave}
          disabled={!canSave}
        >
          {busy ? 'שומר…' : 'שמור וסדר ב-Drive'}
        </button>
      </div>
      {status && (
        <div className={`classify-status ${status.kind === 'err' ? 'is-err' : 'is-ok'}`}>
          {status.text}
        </div>
      )}
    </div>
  )
}

function FolderContentsPanel({
  course,
  kind,
  onBack,
}: {
  course: Course
  kind: FolderKind
  onBack: () => void
}) {
  const folderIds = (course as any).drive_folder_ids ?? null
  const folderId = folderIds?.[kind] ?? null
  const def = FOLDER_DEFS.find((f) => f.kind === kind)!
  return (
    <section className="course-panel">
      <div className="course-panel-head">
        <button type="button" className="back-pill" onClick={onBack} aria-label="חזרה לקורס">
          <ChevronLeft size={16} />
        </button>
        <div className="course-panel-icon"><def.Icon /></div>
        <div className="meta">
          <div className="crumb">{course.title} · {def.label}</div>
          <h2>{def.label}</h2>
        </div>
      </div>
      <div className="drive-panel">
        <FolderSection label={def.label} hint={def.hint} folderId={folderId} />
      </div>
    </section>
  )
}
