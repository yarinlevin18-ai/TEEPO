'use client'

/**
 * /summaries (המוח) — Drive folder explorer.
 *
 * Mockup-driven design: a degree column on top with a flat grid of
 * semester chips (chronological). Click a chip → SemesterCoursesPanel
 * shows the course cards below. Click a course card's folder row →
 * drills into the Drive folder view (CourseFolderOverviewPanel /
 * FolderContentsPanel).
 *
 * Year-of-study still drives data classification under the hood (via
 * buildTree + reclassifyCourse), but it's no longer a visible tree
 * layer — semesters are presented flat, the way the mockup shows them.
 *
 * State invariant: selecting a level resets all deeper selections so the
 * tree never shows a node that lost its parent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Folder, BookOpen, FileText, StickyNote, Mic,
  GraduationCap, Brain, ChevronLeft, Home, ExternalLink,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { useUniversityName } from '@/lib/use-university'
import { FolderSection } from '@/components/summaries/CourseDrivePanel'
import BulkOrganizeLessonsCTA from '@/components/summaries/BulkOrganizeLessonsCTA'
import { useDriveFiles } from '@/lib/use-drive-files'
import { pathForCourse } from '@/lib/drive-folders'
import type { Course } from '@/types'
import type { HebSemester, SemesterBucket } from '@/lib/summaries-tree'
import {
  buildDegreeColumns,
  semesterChipColor,
  type SemesterChip,
} from '@/lib/summaries-degree-columns'

type FolderKind = 'lessons' | 'assignments' | 'notes'

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
  const { db, reclassifyCourse } = useDB() as any
  const universityName = useUniversityName()
  // Prefer the user's named degree (e.g. "תואר ראשון - מנע״ס") over the
  // generic university label. Falls back to university → 'התואר שלי' so
  // the tree never renders a blank node for users who haven't filled it in.
  const degreeLabel: string =
    (db?.settings?.degree_name && String(db.settings.degree_name).trim()) ||
    universityName ||
    'התואר שלי'

  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const columns = useMemo(() => buildDegreeColumns(courses, degreeLabel), [courses, degreeLabel])
  // Flatten chips across all degree columns for the activeChipKey lookup.
  const allChips = useMemo<SemesterChip[]>(
    () => columns.degrees.flatMap(d => d.chips),
    [columns],
  )

  const [activeChipKey, setActiveChipKey] = useState<string | null>(null)
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [activeFolderKind, setActiveFolderKind] = useState<FolderKind | null>(null)

  // First load: auto-pick the "current" semester chip if there is one,
  // otherwise the first chronologically. Avoids landing on an empty panel.
  useEffect(() => {
    if (activeChipKey) return
    const currentChip = allChips.find(c => c.isCurrent)
    if (currentChip) { setActiveChipKey(currentChip.key); return }
    if (allChips.length > 0) setActiveChipKey(allChips[0].key)
  }, [allChips, activeChipKey])

  const activeChip = useMemo<SemesterChip | null>(
    () => allChips.find(c => c.key === activeChipKey) ?? null,
    [allChips, activeChipKey],
  )
  const activeBucket: SemesterBucket | null = activeChip?.bucket ?? null
  const activeCourse = useMemo(
    () => activeBucket?.courses.find((c) => c.id === activeCourseId) ?? null,
    [activeBucket, activeCourseId],
  )

  // Selection handlers — clicking a level resets deeper levels so the
  // tree never shows an orphan node.
  const pickChip = useCallback((key: string) => {
    setActiveChipKey(prev => prev === key ? null : key)
    setActiveCourseId(null)
    setActiveFolderKind(null)
  }, [])
  const pickCourse = useCallback((id: string) => {
    setActiveCourseId(prev => prev === id ? null : id)
    setActiveFolderKind(null)
  }, [])
  const pickFolder = useCallback((kind: FolderKind) => {
    setActiveFolderKind(prev => prev === kind ? null : kind)
  }, [])

  // Bulk "make folders for everything I've classified" — replaces the
  // previous auto-heal effect that silently created folders. A course
  // "needs" a folder when it's at least partially classified AND either
  // has no folder ids yet, or its stored drive_folder_path no longer
  // matches what pathForCourse computes from current classification.
  const coursesNeedingFolders = useMemo(() =>
    courses.filter(c => {
      if (!c.semester && !c.year_of_study) return false
      if (!c.drive_folder_ids?.course) return true
      const currentPath = pathForCourse(c).join('/')
      return c.drive_folder_path !== currentPath
    }),
    [courses])
  const [creatingFolders, setCreatingFolders] = useState<
    { done: number; total: number; failed: number } | null
  >(null)
  const handleCreateFolders = useCallback(async () => {
    if (typeof reclassifyCourse !== 'function') return
    const targets = coursesNeedingFolders
    if (targets.length === 0) return
    setCreatingFolders({ done: 0, total: targets.length, failed: 0 })
    let failed = 0
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i]
      try {
        await reclassifyCourse(c.id, {
          semester: c.semester,
          year_of_study: c.year_of_study,
          academic_year: c.academic_year,
        })
      } catch (e) {
        failed++
        console.warn('[summaries] create folders failed for', c.title, e)
      }
      setCreatingFolders({ done: i + 1, total: targets.length, failed })
    }
    setTimeout(() => setCreatingFolders(null), 2500)
  }, [reclassifyCourse, coursesNeedingFolders])

  return (
    <div className="cream-page summaries-page">
      <main className="sum-main">

        {/* ===== Hero ===== */}
        <header className="sum-head">
          <div className="sum-eyebrow">Google Drive</div>
          <h1 className="sum-h1">
            המוח. <span className="accent">הזיכרון השני שלי.</span>{' '}
            <span className="brain-emoji" aria-hidden>🧠</span>
          </h1>
          <p className="sum-sub">
            כל מקור, סילבוס, סיכום וקובץ — מסונכרן ומאורגן בתוך תיקיית
            Google Drive האישית שלך לפי תואר, סמסטר וקורס.
          </p>
          <a
            href="https://drive.google.com/drive/my-drive"
            target="_blank"
            rel="noopener noreferrer"
            className="drive-link"
          >
            <svg className="gd-logo" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M14.5 2H7l5 8h7.5z"/>
              <path fill="#0F9D58" d="M2 17l3.5 6L10.5 14.5 7 8.5z"/>
              <path fill="#FBBC04" d="M22 17h-7l-3.5 6h7z"/>
            </svg>
            פתח ב-Google Drive ←
          </a>
        </header>

        {/* Onboarding nudge: courses sit under "ללא שנה" because the user
            hasn't told us when they started their degree. */}
        {!db?.settings?.degree_start_year && courses.some(c => c.semester && !c.year_of_study) && (
          <div className="degree-start-nudge" role="status">
            <div className="degree-start-nudge-icon" aria-hidden>
              <GraduationCap size={18} />
            </div>
            <div className="degree-start-nudge-body">
              <strong>הקורסים שלך עוד לא משובצים לשנה.</strong>
              <p>
                כדי שנדע לחלק אותם לשנה א'/ב'/ג'/ד', הגדר מתי התחלת את התואר ב-
                <Link href="/settings" className="degree-start-nudge-link">הגדרות</Link>.
              </p>
            </div>
          </div>
        )}

        {/* Create-folders CTA — appears once the user has classified courses
            that don't yet have Drive folders. */}
        {(coursesNeedingFolders.length > 0 || creatingFolders) && (
          <div className="create-folders-cta">
            <div className="create-folders-body">
              <strong>
                {creatingFolders
                  ? `יוצר תיקיות… ${creatingFolders.done}/${creatingFolders.total}`
                  : `${coursesNeedingFolders.length} קורסים מסווגים מחכים לתיקייה ב-Drive`}
              </strong>
              <small>
                לחץ כשסיימת לסווג — נסדר את התיקיות ב-Drive לפי שנה/סמסטר.
              </small>
            </div>
            <button
              type="button"
              className="create-folders-btn"
              onClick={handleCreateFolders}
              disabled={!!creatingFolders || coursesNeedingFolders.length === 0}
            >
              {creatingFolders
                ? `${creatingFolders.done}/${creatingFolders.total}`
                : `צור תיקיות (${coursesNeedingFolders.length})`}
            </button>
          </div>
        )}

        {/* Bulk "organize שיעורים into per-lesson sub-folders across every
            course" — sister of the per-course button inside FolderSection. */}
        <BulkOrganizeLessonsCTA courses={courses} />

        {/* ===== Tree (degree → semester chips) ===== */}
        <div className="tree-wrap">
          <TreeConnectorsSvg />

          <div className="tree-root">
            <button
              type="button"
              className="node root"
              onClick={() => {
                // Reset → first/current semester chip
                const cur = allChips.find(c => c.isCurrent) ?? allChips[0]
                setActiveChipKey(cur?.key ?? null)
                setActiveCourseId(null)
                setActiveFolderKind(null)
              }}
              title="חזור לתצוגת ברירת המחדל"
            >
              <Home className="folder-ico" />
              <span className="name">TEEPO</span>
              <span className="count">
                {columns.degrees.length} {columns.degrees.length === 1 ? 'תואר' : 'תארים'}
              </span>
            </button>
          </div>

          <div className={`tree-branches columns-${columns.degrees.length}`}>
            {columns.degrees.map((degree) => (
              <div key={degree.id} className="degree-column">
                <div className="degree-header">
                  <div className="node degree" aria-label={degree.name}>
                    <GraduationCap className="folder-ico" />
                    <span className="name">{degree.name}</span>
                    <span className="count">
                      {degree.chips.length} סמסטרים
                    </span>
                  </div>
                </div>

                {degree.chips.length > 0 && (
                  <div className="sem-grid">
                    {degree.chips.map((chip) => {
                      const isActive = chip.key === activeChipKey
                      const color = chip.isUnclassified
                        ? 'var(--lp-muted)'
                        : semesterChipColor(chip.colorIdx)
                      return (
                        <div
                          key={chip.key}
                          className={`sem-chip-wrap ${isActive ? 'active' : ''}`}
                        >
                          <button
                            type="button"
                            className={`node sem ${isActive ? 'active' : ''} ${chip.isCurrent ? 'is-current' : ''}`}
                            style={{ ['--sem-color' as any]: color }}
                            onClick={() => pickChip(chip.key)}
                          >
                            <Folder className="folder-ico" />
                            <span className="name">
                              {chip.label}
                              {chip.isCurrent && <span className="current-pill">נוכחי</span>}
                            </span>
                            <span className="count">{chip.bucket.courses.length}</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Connector line between tree and the panel below */}
        {activeBucket && <div className="connector-line" aria-hidden />}

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

        <p className="subtle-hint">
          לחיצה על סמסטר → רואים את הקורסים שלו · לחיצה על קורס → פותח את
          התיקיות שלו · לחיצה על תיקייה → רואים את הקבצים.
        </p>

      </main>
    </div>
  )
}

/** Empty SVG placeholder — keeps the CSS hook for future connector-drawing.
 *  The mockup draws lines dynamically based on element positions; v1 ships
 *  with the simpler CSS-only connectors. */
function TreeConnectorsSvg() {
  return (
    <svg className="tree-svg" aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" />
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
  const { reclassifyCourse, flushSave } = useDB() as any
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
    if (typeof flushSave === 'function') {
      try { await flushSave() } catch { /* surfaced as bulkErr */ }
    }
    if (firstError) setBulkErr(firstError)
    if (failed === 0) setSelectedIds(new Set())
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

      {/* Bulk classify toolbar */}
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
          const driveUrl = (c as any).drive_folder_ids?.course
            ? `https://drive.google.com/drive/folders/${(c as any).drive_folder_ids.course}`
            : null
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

              <div className="course-card-top">
                <button
                  type="button"
                  className="course-card-title-btn"
                  onClick={() => onPickCourse(c.id)}
                >
                  <div className="ico-wrap"><BookOpen /></div>
                  <div className="title-block">
                    <h3>{c.title}</h3>
                    {(c as any).shortname && <small>{(c as any).shortname}</small>}
                  </div>
                </button>
                {driveUrl && (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="course-card-external"
                    title="פתח ב-Google Drive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>

              <div className="course-card-folders">
                {FOLDER_DEFS.map(({ kind, label, Icon }) => (
                  <button
                    key={kind}
                    type="button"
                    className="course-card-folder-row"
                    onClick={() => {
                      // Drilling into a folder from a card: select the
                      // course first (so the FolderContentsPanel can render
                      // it), then the folder.
                      onPickCourse(c.id)
                      // setTimeout so the course-pick state lands before
                      // we set the folder kind in the parent.
                      setTimeout(() => {
                        const ev = new CustomEvent('teepo-pick-folder', { detail: kind })
                        window.dispatchEvent(ev)
                      }, 0)
                    }}
                    disabled={!(c as any).drive_folder_ids?.course}
                  >
                    <Icon className="ico" />
                    <span className="label">{label}</span>
                    <span className="num">›</span>
                  </button>
                ))}
              </div>
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

  // Pick up the deferred folder-pick from a course card's folder-row click
  // (see SemesterCoursesPanel → course-card-folder-row).
  useEffect(() => {
    const handler = (e: Event) => {
      const kind = (e as CustomEvent).detail as FolderKind
      onPickFolder(kind)
    }
    window.addEventListener('teepo-pick-folder', handler)
    return () => window.removeEventListener('teepo-pick-folder', handler)
  }, [onPickFolder])

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
          <p>התיקיות עוד לא נוצרו ב-Drive. סווג את הקורס למעלה ולחץ "צור תיקיות" כדי שייווצרו.</p>
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
  const { reclassifyCourse, flushSave } = useDB() as any
  const [semester, setSemester] = useState<HebSemester | ''>(course.semester ?? '')
  const [yearOfStudy, setYearOfStudy] = useState<number | ''>(course.year_of_study ?? '')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

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
      if (typeof flushSave === 'function') {
        try { await flushSave() } catch { /* surfaced as status err below */ }
      }
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
