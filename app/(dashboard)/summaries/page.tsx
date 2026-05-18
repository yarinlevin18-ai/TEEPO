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
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Folder, BookOpen, FileText, NotebookPen, Presentation, ClipboardList,
  GraduationCap, Brain, ChevronLeft, Home, ExternalLink, Sparkles, ArrowLeft,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { FolderSection } from '@/components/summaries/CourseDrivePanel'
import BulkOrganizeLessonsCTA from '@/components/summaries/BulkOrganizeLessonsCTA'
import LessonActionBar from '@/components/summaries/LessonActionBar'
import { useDriveFiles } from '@/lib/use-drive-files'
import { pathForCourse } from '@/lib/drive-folders'
import type { Course } from '@/types'
import type { HebSemester, SemesterBucket } from '@/lib/summaries-tree'
import {
  buildDegreeColumns,
  semesterChipColor,
  type SemesterChip,
} from '@/lib/summaries-degree-columns'
import { resolveDegrees } from '@/lib/degrees'
import {
  useSvgTreeConnectors,
  type ConnectorHelpers,
  type ConnectorPoint,
} from '@/lib/use-svg-tree-connectors'

type FolderKind = 'lessons' | 'assignments' | 'notes'

const FOLDER_DEFS: Array<{ kind: FolderKind; label: string; hint: string; Icon: any }> = [
  // Icons chosen to read at a glance: a presentation screen for lectures,
  // a clipboard with line-items for assignments, and a pen-on-notebook for
  // personal summaries. Earlier icons (Mic / Folder / StickyNote) were
  // either ambiguous or generic.
  { kind: 'lessons',     label: 'שיעורים',  hint: 'הרצאות, תרגולים, מצגות',        Icon: Presentation },
  { kind: 'assignments', label: 'מטלות',    hint: 'תרגילים, פרויקטים, בחנים',      Icon: ClipboardList },
  { kind: 'notes',       label: 'סיכומים', hint: 'הסיכומים האישיים שלך',           Icon: NotebookPen },
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
  // Degree list — supports dual-degree (תואר דו-חוגי). resolveDegrees
  // hydrates from settings.degrees[] first, then falls back to the legacy
  // settings.degree_name single-string field for users who haven't been
  // migrated yet. Always returns ≥1 degree.
  const degrees = useMemo(() => resolveDegrees(db?.settings ?? null), [db?.settings])
  // Show the degree-row only when there are 2+ degrees OR the single one
  // has a real name. A nameless single degree skips the pill entirely so
  // the tree reads TEEPO → semester chips without a placeholder.
  const showDegreePill = degrees.length > 1 || (degrees[0]?.name?.trim()?.length ?? 0) > 0

  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const columns = useMemo(() => buildDegreeColumns(courses, degrees), [courses, degrees])
  // Flatten chips across all degree columns for the activeChipKey lookup.
  const allChips = useMemo<SemesterChip[]>(
    () => columns.degrees.flatMap(d => d.chips),
    [columns],
  )

  // Count of courses still living under TEEPO/לא מסווגים/ — same predicate
  // as /courses/classify uses. Drives the bulk-classify banner below.
  const unclassifiedCount = useMemo(
    () => courses.filter((c) => !c.year_of_study && !c.semester).length,
    [courses],
  )

  const [activeChipKey, setActiveChipKey] = useState<string | null>(null)
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [activeFolderKind, setActiveFolderKind] = useState<FolderKind | null>(null)

  // Refs for the SVG tree overlay. The hook fires after layout, measures
  // node positions inside `treeWrapRef`, and paints connector paths
  // into `treeSvgRef`. Re-runs whenever the tree shape (`columns` /
  // `showDegreePill`) changes, plus on resize / font-load / animation
  // settle (see lib/use-svg-tree-connectors.ts).
  const treeWrapRef = useRef<HTMLDivElement | null>(null)
  const treeSvgRef = useRef<SVGSVGElement | null>(null)
  useSvgTreeConnectors(
    treeWrapRef,
    treeSvgRef,
    drawSummariesTree,
    [columns, showDegreePill],
  )

  // First load: auto-pick the "current" semester chip if there is one,
  // otherwise the first chronologically. Avoids landing on an empty panel.
  useEffect(() => {
    if (activeChipKey) return
    const currentChip = allChips.find(c => c.isCurrent)
    if (currentChip) { setActiveChipKey(currentChip.key); return }
    if (allChips.length > 0) setActiveChipKey(allChips[0].key)
  }, [allChips, activeChipKey])

  // Deep-link from dashboard ("היום בלוח" row click): /summaries?course=ID&lesson=Title
  // Find the chip that contains the course, select chip + course so the
  // CourseFolderOverviewPanel renders with the LessonActionBar.
  // Once consumed the params are stripped from the URL so a refresh
  // doesn't re-trigger the modal-like state.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const courseQuery = searchParams.get('course')
  const lessonQuery = searchParams.get('lesson')
  useEffect(() => {
    if (!courseQuery) return
    if (courses.length === 0) return  // wait for DB to hydrate
    const targetChip = allChips.find(chip =>
      chip.bucket.courses.some(c => c.id === courseQuery),
    )
    if (!targetChip) return
    setActiveChipKey(targetChip.key)
    setActiveCourseId(courseQuery)
    setActiveFolderKind(null)
    // Strip the params so back/forward + refresh don't keep re-triggering.
    const next = new URLSearchParams(searchParams.toString())
    next.delete('course')
    next.delete('lesson')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseQuery, allChips, courses.length])
  // Keep the lesson title across the param-strip above so LessonActionBar
  // still has something to display after we cleaned the URL.
  const [deepLinkLesson, setDeepLinkLesson] = useState<string | null>(null)
  useEffect(() => {
    if (lessonQuery) setDeepLinkLesson(lessonQuery)
  }, [lessonQuery])

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

        {/* Bulk-classify banner — appears first because unclassified courses
            are the most urgent thing to fix; nothing else can be classified
            into year/semester folders until this is resolved. */}
        {unclassifiedCount > 0 && (
          <Link href="/courses/classify" className="classify-banner" prefetch={false}>
            <div className="classify-banner-icon"><Sparkles size={18} /></div>
            <div className="classify-banner-text">
              <strong>יש לך {unclassifiedCount} קורסים לא מסווגים</strong>
              <span>סווג שנה + סמסטר בבת אחת והקבצים יסתדרו אוטומטית בתיקיות הנכונות.</span>
            </div>
            <div className="classify-banner-cta">
              סווג עכשיו <ArrowLeft size={16} />
            </div>
          </Link>
        )}

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

        {/* ===== Tree (degree → semester chips) =====
            Connectors are painted into <svg.tree-svg> by the
            useSvgTreeConnectors hook above, after layout. Don't add CSS
            ::before/::after lines back — they can't measure sibling
            positions and end up misaligned across viewports. */}
        <div className="tree-wrap" ref={treeWrapRef}>
          <svg
            ref={treeSvgRef}
            className="tree-svg"
            aria-hidden
            xmlns="http://www.w3.org/2000/svg"
          />

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

          {/* Degree columns side by side (one per degree). Inside each
              column the tree continues: degree → year → semester chips.
              Year branches collapse when the column only has a single
              year so single-degree single-year users don't get an extra
              "שנה א'" pill for nothing. */}
          <div className={`tree-branches columns-${columns.degrees.length} ${showDegreePill ? '' : 'no-degree-pill'}`}>
            {columns.degrees.map((degree) => {
              const degreeIsActive = degree.chips.some(c => c.key === activeChipKey)
              // Render flat (no year nodes) when there's only one year group
              // in this degree column — the extra node adds noise without
              // information.
              const flatten = degree.yearGroups.length <= 1
              return (
                <div key={degree.id} className="degree-column">
                  {showDegreePill && (
                    <div className="degree-header">
                      <div
                        className={`node degree ${degreeIsActive ? 'active' : ''}`}
                        aria-label={degree.name}
                      >
                        <GraduationCap className="folder-ico" />
                        <span className="name">{degree.name}</span>
                        <span className="count">
                          {degree.chips.length} סמסטרים
                        </span>
                      </div>
                    </div>
                  )}

                  {flatten ? (
                    degree.chips.length > 0 && (
                      <div className="sem-grid">
                        {degree.chips.map((chip) => (
                          <SemChip
                            key={chip.key}
                            chip={chip}
                            isActive={chip.key === activeChipKey}
                            onPick={pickChip}
                          />
                        ))}
                      </div>
                    )
                  ) : (
                    // Multi-year column → render one .year-row per year,
                    // each with its own semester sub-grid.
                    degree.yearGroups.map((yg) => (
                      <div key={yg.yearKey} className="year-row">
                        <div className="year-row-head">
                          <div className="node year" aria-label={yg.yearLabel}>
                            <GraduationCap className="folder-ico" />
                            <span className="name">{yg.yearLabel}</span>
                            <span className="count">
                              {yg.chips.length} {yg.chips.length === 1 ? 'סמסטר' : 'סמסטרים'}
                            </span>
                          </div>
                        </div>
                        {yg.chips.length > 0 && (
                          <div className="sem-grid">
                            {yg.chips.map((chip) => (
                              <SemChip
                                key={chip.key}
                                chip={chip}
                                isActive={chip.key === activeChipKey}
                                onPick={pickChip}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )
            })}
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
            onBack={() => { setActiveCourseId(null); setDeepLinkLesson(null) }}
            lessonFromCalendar={deepLinkLesson}
            onDismissLesson={() => setDeepLinkLesson(null)}
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

/**
 * Paint the summaries tree connectors. Called by `useSvgTreeConnectors`
 * inside SummariesPage after every layout change. Direct port of the
 * algorithm at the bottom of `teepo-design/mockup_summaries.html` —
 * straight lines plus horizontal joiner bars (no curved elbows; those
 * belong to the drive-organize variant in PR #4).
 *
 * Three branching cases, picked at runtime based on what's in the DOM:
 *   (a) No degree pill (single nameless degree)
 *       → root → joiner bar → sem chips directly
 *   (b) Degree pill, flat (single year of study)
 *       → root → joiner → degree pills → sem chips
 *   (c) Degree pill, multi-year
 *       → root → joiner → degree pills → year-pill → sem chips
 *
 * Each parent with >1 children fans out via a horizontal joiner bar,
 * matching the mockup. A single child gets a straight line (no joiner).
 */
function drawSummariesTree(h: ConnectorHelpers): void {
  const root = h.wrap.querySelector('.tree-root .node')
  if (!root) return
  const rb = h.center(root, 'bottom')

  const degrees = Array.from(
    h.wrap.querySelectorAll('.degree-header .node.degree'),
  ) as HTMLElement[]

  // Case (a): no degree pill — root connects straight to all sem chips.
  if (degrees.length === 0) {
    const chips = Array.from(
      h.wrap.querySelectorAll('.sem-chip-wrap .node.sem'),
    ) as HTMLElement[]
    fanOut(h, rb, chips.map(c => h.center(c, 'top')))
    return
  }

  // Cases (b) and (c): root → degree pills.
  fanOut(h, rb, degrees.map(d => h.center(d, 'top')))

  // Then for each degree column: degree → (year-row | flat sem-grid).
  h.wrap.querySelectorAll('.degree-column').forEach((col) => {
    const deg = col.querySelector('.degree-header .node')
    if (!deg) return
    const db = h.center(deg, 'bottom')

    // `:scope >` constrains the year-rows to the current degree-column,
    // so a degree with year rows doesn't accidentally grab another
    // column's children.
    const yearRows = Array.from(col.querySelectorAll(':scope > .year-row')) as HTMLElement[]
    if (yearRows.length === 0) {
      // Flat: degree → sem chips directly.
      const chips = Array.from(
        col.querySelectorAll('.sem-chip-wrap .node.sem'),
      ) as HTMLElement[]
      fanOut(h, db, chips.map(c => h.center(c, 'top')))
      return
    }

    // Multi-year: degree → year-pills (one per year row), then each
    // year-pill → its sem chips.
    const yearPills = yearRows
      .map(yr => yr.querySelector('.year-row-head .node.year'))
      .filter((n): n is HTMLElement => n != null)
    fanOut(h, db, yearPills.map(p => h.center(p, 'top')))

    yearRows.forEach((yr) => {
      const yearPill = yr.querySelector('.year-row-head .node.year')
      if (!yearPill) return
      const yb = h.center(yearPill, 'bottom')
      const chips = Array.from(
        yr.querySelectorAll('.sem-chip-wrap .node.sem'),
      ) as HTMLElement[]
      fanOut(h, yb, chips.map(c => h.center(c, 'top')))
    })
  })
}

/**
 * Connect a single parent point to N children using a horizontal joiner
 * bar. With 1 child, degenerates to a straight line. With ≥2, paints:
 *   - parent → joiner Y (vertical drop)
 *   - joiner bar across child X span (horizontal)
 *   - junction dot at the parent's X on the joiner
 *   - vertical drop from joiner to each child's top
 */
function fanOut(
  h: ConnectorHelpers,
  parent: ConnectorPoint,
  childTops: ConnectorPoint[],
): void {
  if (childTops.length === 0) return
  if (childTops.length === 1) {
    h.line(parent.x, parent.y, childTops[0].x, childTops[0].y)
    return
  }
  const minChildY = Math.min(...childTops.map(c => c.y))
  const joinerY = (parent.y + minChildY) / 2
  // Parent → joiner
  h.line(parent.x, parent.y, parent.x, joinerY)
  // Horizontal joiner bar
  const xs = childTops.map(c => c.x)
  h.line(Math.min(...xs), joinerY, Math.max(...xs), joinerY)
  // Junction dot where parent's vertical meets the bar
  h.dot(parent.x, joinerY)
  // Joiner → each child
  childTops.forEach((c) => {
    h.line(c.x, joinerY, c.x, c.y)
  })
}

/** Single semester chip rendered inside any sem-grid. Extracted so the
 *  flat-degree and per-year layouts share the exact same chip markup. */
function SemChip({
  chip,
  isActive,
  onPick,
}: {
  chip: SemesterChip
  isActive: boolean
  onPick: (key: string) => void
}) {
  const color = chip.isUnclassified
    ? 'var(--lp-muted)'
    : semesterChipColor(chip.colorIdx)
  return (
    <div className={`sem-chip-wrap ${isActive ? 'active' : ''}`}>
      <button
        type="button"
        className={`node sem ${isActive ? 'active' : ''} ${chip.isCurrent ? 'is-current' : ''}`}
        style={{ ['--sem-color' as any]: color }}
        onClick={() => onPick(chip.key)}
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
}


// ── Below-tree panels ──────────────────────────────────────────────────

/** Snapshot of a course's classification fields, captured right BEFORE
 *  a bulk-classify so the user can hit "בטל" and roll the change back. */
interface BulkUndoSnapshot {
  ts: number
  /** Localized verb for the undo banner: "סווגו 4 קורסים — בטל". */
  count: number
  snapshots: Array<{
    courseId: string
    prev: {
      year_of_study?: Course['year_of_study']
      semester?: Course['semester']
      degree_id?: string
    }
  }>
}

const UNDO_WINDOW_MS = 30_000

function SemesterCoursesPanel({
  bucket,
  onPickCourse,
}: {
  bucket: SemesterBucket
  onPickCourse: (id: string) => void
}) {
  const { db, reclassifyCourse, flushSave } = useDB() as any
  // Degree list for the bulk-classify dropdown (only rendered when 2+).
  const degrees = useMemo(() => resolveDegrees(db?.settings ?? null).filter(d => d.name.length > 0), [db?.settings])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkYear, setBulkYear] = useState<number | ''>('')
  const [bulkSem, setBulkSem] = useState<HebSemester | ''>('')
  const [bulkDegreeId, setBulkDegreeId] = useState<string>('')
  const [bulkStatus, setBulkStatus] = useState<{ done: number; total: number; failed: number } | null>(null)
  const [bulkErr, setBulkErr] = useState<string | null>(null)
  // Most-recent bulk action snapshot — drives the "בטל" undo banner.
  // Auto-clears after UNDO_WINDOW_MS so the banner doesn't linger forever.
  const [lastBulk, setLastBulk] = useState<BulkUndoSnapshot | null>(null)
  const [undoing, setUndoing] = useState<{ done: number; total: number } | null>(null)

  // Clear selection when the bucket changes (user navigated away and back).
  // We do NOT clear lastBulk here on purpose — the undo banner should stay
  // visible even if the user navigates between chips while still inside
  // the undo window.
  useEffect(() => {
    setSelectedIds(new Set())
    setBulkStatus(null)
    setBulkErr(null)
    setBulkDegreeId('')
  }, [bucket.key])

  // Auto-expire the undo snapshot after the window passes.
  useEffect(() => {
    if (!lastBulk) return
    const remaining = lastBulk.ts + UNDO_WINDOW_MS - Date.now()
    if (remaining <= 0) { setLastBulk(null); return }
    const id = setTimeout(() => setLastBulk(null), remaining)
    return () => clearTimeout(id)
  }, [lastBulk])

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
    (bulkYear !== '' || bulkSem !== '' || bulkDegreeId !== '') &&
    bulkStatus === null

  const applyBulk = async () => {
    if (!canApply || typeof reclassifyCourse !== 'function') return
    const ids = Array.from(selectedIds)
    // Capture each course's CURRENT classification BEFORE we touch them, so
    // the undo banner can restore the exact prior state per-course (each
    // course may have had different starting year/semester/degree).
    const snapshots = ids
      .map((id) => {
        const c = bucket.courses.find((x) => x.id === id)
        if (!c) return null
        return {
          courseId: id,
          prev: {
            year_of_study: c.year_of_study,
            semester: c.semester,
            degree_id: (c as any).degree_id,
          },
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
    setBulkErr(null)
    setBulkStatus({ done: 0, total: ids.length, failed: 0 })
    let failed = 0
    let firstError: string | null = null
    for (let i = 0; i < ids.length; i++) {
      try {
        await reclassifyCourse(ids[i], {
          year_of_study: (bulkYear || undefined) as Course['year_of_study'],
          semester: (bulkSem || undefined) as Course['semester'],
          degree_id: bulkDegreeId || undefined,
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
    if (failed === 0) {
      setSelectedIds(new Set())
      // Only offer undo when EVERYTHING succeeded — undoing partial state
      // would require knowing which ones actually changed, more trouble
      // than it's worth for the rare partial-failure case.
      setLastBulk({ ts: Date.now(), count: snapshots.length, snapshots })
    }
    setTimeout(() => setBulkStatus(null), 2500)
  }

  const undoLastBulk = async () => {
    if (!lastBulk || typeof reclassifyCourse !== 'function') return
    setUndoing({ done: 0, total: lastBulk.snapshots.length })
    let failed = 0
    for (let i = 0; i < lastBulk.snapshots.length; i++) {
      const s = lastBulk.snapshots[i]
      try {
        // Pass the previous values verbatim (undefined included) so
        // reclassifyCourse restores the exact prior shape — including
        // clearing fields back to undefined when needed.
        await reclassifyCourse(s.courseId, s.prev)
      } catch (e) {
        failed++
        console.warn('[bulk-undo] failed for', s.courseId, e)
      }
      setUndoing({ done: i + 1, total: lastBulk.snapshots.length })
    }
    if (typeof flushSave === 'function') {
      try { await flushSave() } catch { /* best-effort */ }
    }
    setUndoing(null)
    setLastBulk(null)
    if (failed > 0) setBulkErr(`לא הצלחנו לבטל ${failed} סיווגים`)
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

  // Only surface the bulk-classify toolbar when there's actually
  // year/semester work to do. We previously also forced it open whenever
  // a dual-degree user had an unassigned course in the bucket — but
  // courses ARE visible in their semester bucket regardless of degree
  // (unassigned ones default to the first degree column), so showing the
  // toolbar then made the user think they weren't classified at all.
  // Dual-degree assignment moves to per-course UI in a follow-up.
  const needsClassify =
    bucket.isUnclassified ||
    bucket.semester === null ||
    bucket.courses.some(c => !c.year_of_study || !c.semester)

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

      {/* Bulk classify toolbar — only when there's still classification work to do. */}
      {needsClassify && (
      <>
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
          {degrees.length > 1 && (
            <select
              className="bulk-select"
              value={bulkDegreeId}
              onChange={(e) => setBulkDegreeId(e.target.value)}
              disabled={!someSelected || bulkStatus !== null}
              aria-label="תואר"
            >
              <option value="">תואר —</option>
              {degrees.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
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
      </>
      )}

      {/* Undo banner — surfaces immediately after a successful bulk action.
       *  Stays visible (across chip switches too) until the user clicks
       *  בטל, dismisses, or the 30s window expires. Lives OUTSIDE the
       *  needsClassify gate so it's reachable even when the toolbar
       *  itself has hidden (e.g. user fixed everything and now wants to
       *  revert). */}
      {lastBulk && (
        <div className="bulk-undo" role="status">
          <span>
            {undoing
              ? `מבטל… ${undoing.done}/${undoing.total}`
              : `${lastBulk.count} ${lastBulk.count === 1 ? 'קורס סווג' : 'קורסים סווגו'}`}
          </span>
          <div className="bulk-undo-actions">
            <button
              type="button"
              className="bulk-undo-btn"
              onClick={undoLastBulk}
              disabled={undoing !== null}
            >
              בטל
            </button>
            <button
              type="button"
              className="bulk-undo-dismiss"
              onClick={() => setLastBulk(null)}
              disabled={undoing !== null}
              aria-label="הסתר"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="course-grid">
        {bucket.courses.map((c, i) => {
          const palette = COURSE_PALETTE[i % COURSE_PALETTE.length]
          const isSelected = selectedIds.has(c.id)
          const driveUrl = (c as any).drive_folder_ids?.course
            ? `https://drive.google.com/drive/folders/${(c as any).drive_folder_ids.course}`
            : null
          // For dual-degree users, surface the course's degree assignment
          // as a small pill+dropdown so they can re-route a course from
          // degree A to degree B without going through bulk-classify.
          // Default fallback (degrees[0]) is highlighted as the assumed
          // value when degree_id isn't explicitly set.
          const currentDegreeId =
            ((c as any).degree_id && degrees.some(d => d.id === (c as any).degree_id))
              ? (c as any).degree_id
              : degrees[0]?.id
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

              {degrees.length > 1 && (
                <div className="course-card-degree" onClick={(e) => e.stopPropagation()}>
                  <span className="course-card-degree-label">תואר</span>
                  <select
                    className="course-card-degree-select"
                    value={currentDegreeId ?? ''}
                    onChange={async (e) => {
                      const newId = e.target.value
                      try {
                        await reclassifyCourse(c.id, { degree_id: newId })
                        if (typeof flushSave === 'function') await flushSave()
                      } catch (err) {
                        console.warn('[degree-picker] failed', err)
                      }
                    }}
                    aria-label="שנה את התואר של הקורס"
                  >
                    {degrees.map(d => (
                      <option key={d.id} value={d.id}>{d.name || '(ללא שם)'}</option>
                    ))}
                  </select>
                </div>
              )}

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
  lessonFromCalendar,
  onDismissLesson,
}: {
  course: Course
  onPickFolder: (k: FolderKind) => void
  onBack: () => void
  /** Calendar event title that brought us here via a /summaries?lesson= deep
   *  link. When set, renders LessonActionBar above the folder grid. */
  lessonFromCalendar?: string | null
  onDismissLesson?: () => void
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

      {lessonFromCalendar && (
        <LessonActionBar
          course={course}
          lessonTitle={lessonFromCalendar}
        />
      )}

      {/* ClassifyWidget intentionally hidden here — courses surfaced inside
       *  a semester panel are already classified, and showing the inline
       *  שנה/סמסטר picker on every course was visual noise. Mis-classified
       *  courses can be fixed from the "לא מסווגים" bucket bulk-bar. */}

      {!folderIds?.course ? (
        <div className="empty-state">
          <Folder />
          <p>התיקיות עוד לא נוצרו ב-Drive. חזרו ל"לא מסווגים" כדי לסווג את הקורס, ואז ייווצרו תיקיות אוטומטית.</p>
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
