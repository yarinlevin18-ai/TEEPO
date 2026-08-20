'use client'

/**
 * <DriveOrganize /> — v2 cream redesign for /courses.
 *
 * Source of truth: teepo-design/mockup_drive_organize.html (locked v2).
 *
 * Layout (top → bottom):
 *   1. Info banner — cream card with title + description and the
 *      "פרק וסדר" gradient CTA on the left. Replaces the old purple
 *      header (per CLAUDE_CODE_HANDOFF §11: "cream info banner, NOT
 *      purple, with the 'פרק וסדר' action button on the left in
 *      `--lp-gradient`").
 *   2. Classify banner (conditional) — surfaces unclassified courses.
 *      Hidden when everything has a year + semester assigned.
 *   3. Tree card — 4 levels (teepo → degree → year → semester) with
 *      SVG-painted rounded-elbow connectors.
 *
 * Empty state: if the user has no degrees configured AND no courses,
 * we route them to /credits to set up their track instead of
 * rendering a broken tree (per task spec).
 *
 * Wiring (unchanged from production):
 *   - `useDB()`              → courses + settings
 *   - `resolveDegrees()`     → settings.degrees with legacy fallback
 *   - `buildDegreeColumns()` → same helper as /summaries so the two
 *                              pages always agree on tree shape
 *
 * Connector algorithm: ported verbatim from the inline `<script>` at
 * the bottom of mockup_drive_organize.html. Each level uses the
 * rounded-elbow path (vertical drop → 90° curve → horizontal traverse
 * → 90° curve → vertical drop). Junction dots sit under every parent.
 * The `<SvgTreeConnectors />` component owns the painted SVG; the
 * draw callback runs after every layout change so the lines track the
 * actual measured positions of the cream cards.
 */

import { useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  Plus, Folder, GraduationCap, Home, Sparkles, ArrowLeft, Compass,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { resolveDegrees } from '@/lib/degrees'
import {
  buildDegreeColumns,
  type DegreeColumn,
  type YearGroupColumn,
  type SemesterChip,
} from '@/lib/summaries-degree-columns'
import type { ConnectorHelpers } from '@/lib/use-svg-tree-connectors'
import type { Course } from '@/types'
import SvgTreeConnectors from './SvgTreeConnectors'
import EmptyState from '@/components/ui/EmptyState'

export default function DriveOrganize() {
  const { db } = useDB() as any
  const degrees = useMemo(() => resolveDegrees(db?.settings ?? null), [db?.settings])
  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const columns = useMemo(() => buildDegreeColumns(courses, degrees), [courses, degrees])
  const unclassifiedCount = useMemo(
    () => courses.filter((c) => !c.year_of_study && !c.semester).length,
    [courses],
  )

  // SVG connector overlay — re-paints when the tree shape changes, on
  // viewport resize, and after the fadeUp entry stagger. The wrap ref
  // is the bounding box for both the rendered <path> coordinates and
  // the `querySelector` lookups inside `drawDriveTree`.
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Empty state — no real degrees configured AND no courses yet. The
  // resolveDegrees() helper always returns a synthetic placeholder so
  // we have to look at the *content* to tell a fresh account apart from
  // a configured one. Sending the user to /credits unblocks them.
  const hasRealDegree = degrees.some((d) => (d.name || '').trim().length > 0)
  if (!hasRealDegree && courses.length === 0) {
    return (
      <div className="drive-organize-v2">
        <EmptyState
          icon={<Compass size={28} />}
          title="עוד לא הגדרת תואר"
          description="כדי להתחיל לסדר את תיקיות הקורסים שלך, הגדר את המסלול האקדמי. נשתמש בזה כדי לבנות את העץ teepo → תואר → שנה → סמסטר."
          action={
            <Link href="/credits" className="do-v2-empty-cta">
              <Compass size={16} />
              הגדר תואר
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="drive-organize-v2">

      {/* Info banner — cream card, gradient "פרק וסדר" on the left
          (per handoff §11). Hebrew copy from mockup verbatim. */}
      <div className="do-v2-banner">
        <div className="do-v2-banner-text">
          <div className="do-v2-banner-title">
            סדר תיקיות שיעורים בכל הקורסים בבת אחת
          </div>
          <div className="do-v2-banner-desc">
            נסרוק את תיקיות השיעורים בכל קורס, נציע אילו שבועות לקבץ לתת-תיקיות, ונקבל ממך אישור לפני שעושים שינויים ב-Drive.
          </div>
        </div>
        <div className="do-v2-banner-actions">
          <Link
            href="/courses/extract"
            className="do-v2-banner-secondary"
            prefetch={false}
            title="הוסף קורס חדש ידנית"
          >
            <Plus size={16} />
            הוסף קורס
          </Link>
          <Link
            href="/courses/classify"
            className="do-v2-banner-action"
            prefetch={false}
          >
            <Folder size={16} />
            פרק וסדר
          </Link>
        </div>
      </div>

      {/* Classify banner — shown only when there's something to triage,
          so users with a fully classified library don't see banner clutter. */}
      {unclassifiedCount > 0 && (
        <Link
          href="/courses/classify"
          className="do-v2-classify-banner"
          prefetch={false}
        >
          <div className="do-v2-classify-icon"><Sparkles size={18} /></div>
          <div className="do-v2-classify-text">
            <strong>
              יש לך {unclassifiedCount} קורסים לא מסווגים
            </strong>
            <span>
              סווג שנה + סמסטר בבת אחת והקבצים יסתדרו אוטומטית בתיקיות הנכונות.
            </span>
          </div>
          <div className="do-v2-classify-cta">
            סווג עכשיו <ArrowLeft size={16} />
          </div>
        </Link>
      )}

      {/* Tree card — the 4-level visualization. role="tree" + treeitem
          ARIA per task spec; the SVG is decorative + measured against
          DOM positions so it's marked aria-hidden inside the wrapper. */}
      <div className="do-v2-tree-card" ref={wrapRef}>
        <SvgTreeConnectors
          wrapRef={wrapRef}
          draw={drawDriveTree}
          deps={[columns]}
        />

        <div
          role="tree"
          aria-label="תיקיות teepo לפי תואר, שנה וסמסטר"
          className="do-v2-tree-inner"
        >
          {/* Level 1: teepo root */}
          <div className="tree-root">
            <Link
              href="/summaries"
              className="node root"
              prefetch={false}
              role="treeitem"
              aria-level={1}
              aria-expanded={columns.degrees.length > 0}
            >
              <Home className="ico" />
              <span className="name">teepo</span>
              <span className="count">
                {columns.degrees.length}{' '}
                {columns.degrees.length === 1 ? 'תואר' : 'תארים'}
              </span>
            </Link>
          </div>

          {/* Levels 2-4: degree → year → semester */}
          <div
            className="tree-branches"
            data-columns={Math.min(columns.degrees.length, 2)}
            role="group"
          >
            {columns.degrees.map((degree) => (
              <DegreeColumnView key={degree.id} degree={degree} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Subtrees
// ──────────────────────────────────────────────────────────────────────

function DegreeColumnView({ degree }: { degree: DegreeColumn }) {
  // Hide the synthetic "ללא שנה" + "לא מסווגים" buckets from the tree
  // — they're surfaced via the classify banner above so the user has a
  // dedicated path to triage them without breaking the visual cadence
  // of the year columns.
  const realYears = degree.yearGroups.filter((yg) => yg.yearKey !== 'unclassified')
  const semesterCount = realYears.reduce((acc, yg) => acc + yg.chips.length, 0)

  return (
    <div className="degree-column" role="group">
      <div className="degree-header">
        <button
          className="node degree"
          type="button"
          aria-label={degree.name || 'תואר'}
          role="treeitem"
          aria-selected={false}
          aria-level={2}
          aria-expanded={realYears.length > 0}
        >
          <GraduationCap className="ico" />
          <span className="name">{degree.name || 'תואר'}</span>
          <span className="count">
            {semesterCount} {semesterCount === 1 ? 'סמסטר' : 'סמסטרים'}
          </span>
        </button>
      </div>

      {realYears.map((yg) => (
        <YearGroupView key={yg.yearKey} group={yg} />
      ))}
    </div>
  )
}

function YearGroupView({ group }: { group: YearGroupColumn }) {
  return (
    <div className="year-group" role="group">
      <div className="year-header">
        <button
          className="node year"
          type="button"
          aria-label={group.yearLabel}
          role="treeitem"
          aria-selected={false}
          aria-level={3}
          aria-expanded={group.chips.length > 0}
        >
          <GraduationCap className="ico" />
          <span className="name">{group.yearLabel}</span>
          <span className="count">
            {group.chips.length} {group.chips.length === 1 ? 'סמסטר' : 'סמסטרים'}
          </span>
        </button>
      </div>
      {group.chips.length > 0 && (
        <div
          className="semester-row"
          data-chips={Math.min(group.chips.length, 3)}
          role="group"
        >
          {group.chips.map((chip) => (
            <SemChipNode key={chip.key} chip={chip} />
          ))}
        </div>
      )}
    </div>
  )
}

function SemChipNode({ chip }: { chip: SemesterChip }) {
  // Each chip deep-links into /summaries with the chip preselected —
  // matches the activeChipKey state shape on that page.
  const href = `/summaries?chip=${encodeURIComponent(chip.key)}`
  return (
    <Link
      href={href}
      className="node sem"
      prefetch={false}
      title={chip.label}
      role="treeitem"
      aria-level={4}
    >
      <Folder className="ico" />
      <span className="name">{chip.label}</span>
      <span className="count">{chip.bucket.courses.length}</span>
    </Link>
  )
}

// ──────────────────────────────────────────────────────────────────────
// SVG draw callback — the rounded-elbow algorithm from
// teepo-design/mockup_drive_organize.html (lines ~440-525 of the
// inline <script>). The hook clears the SVG before each call, so we
// just re-emit every path + junction dot fresh.
//
//   Level 1→2 (root → each degree):   one elbow per degree
//   Level 2→3 (degree → each year):   one elbow per year, dot at parent
//   Level 3→4 (year → each semester): one elbow per chip, dot at parent
//
// Splitting this out as a top-level function (not a closure) keeps
// the React render path lean and makes the algorithm testable on
// its own.
// ──────────────────────────────────────────────────────────────────────

export function drawDriveTree(h: ConnectorHelpers): void {
  const root = h.wrap.querySelector('.tree-root .node.root')
  if (!root) return
  const rb = h.center(root, 'bottom')

  // Level 1 → 2: root → each degree pill.
  const degrees = Array.from(
    h.wrap.querySelectorAll('.degree-header .node.degree'),
  ) as HTMLElement[]
  degrees.forEach((d) => {
    const dt = h.center(d, 'top')
    h.path(h.elbow(rb.x, rb.y, dt.x, dt.y))
  })
  if (degrees.length > 0) h.dot(rb.x, rb.y, 3)

  // Levels 2 → 4: traverse each degree column.
  h.wrap.querySelectorAll('.degree-column').forEach((col) => {
    const deg = col.querySelector('.degree-header .node.degree')
    if (!deg) return
    const db = h.center(deg, 'bottom')
    h.dot(db.x, db.y, 3)

    // Level 2 → 3: degree → each year pill.
    const yearPills = Array.from(
      col.querySelectorAll('.year-header .node.year'),
    ) as HTMLElement[]
    yearPills.forEach((y) => {
      const yt = h.center(y, 'top')
      h.path(h.elbow(db.x, db.y, yt.x, yt.y))
    })

    // Level 3 → 4: each year → its semester chips.
    col.querySelectorAll('.year-group').forEach((yg) => {
      const yh = yg.querySelector('.year-header .node.year')
      if (!yh) return
      const yb = h.center(yh, 'bottom')
      const chips = Array.from(
        yg.querySelectorAll('.semester-row .node.sem'),
      ) as HTMLElement[]
      if (chips.length === 0) return
      h.dot(yb.x, yb.y, 2.5)
      chips.forEach((s) => {
        const st = h.center(s, 'top')
        h.path(h.elbow(yb.x, yb.y, st.x, st.y))
      })
    })
  })
}
