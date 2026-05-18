'use client'

/**
 * <DriveOrganize /> — the 4-level course folder tree on /courses.
 *
 * Direct port of teepo-design/mockup_drive_organize.html.
 *
 * Layout (top to bottom):
 *   1. Info banner — title + description + "פרק וסדר" CTA. The CTA
 *      links to /courses/classify (the bulk-classify flow). Cream card
 *      with the gradient green button on the left — replaces the old
 *      purple/violet "פרק וסדר" header from the previous v1/v2 designs.
 *   2. Classify banner (conditional) — shown only if there are
 *      unclassified courses, so the user has a direct path to triage them.
 *   3. Tree card — 4 levels (teepo → degree → year → semester) with
 *      SVG-painted elbow-curve connectors between them.
 *
 * The tree is purely navigational — clicking a node deep-links into
 * /summaries with the appropriate scope. Add a new course manually via
 * the small "+" button in the info banner → /courses/extract.
 *
 * Data flows from useDB() → buildDegreeColumns() (same helper as the
 * /summaries page, so the tree shape stays consistent across both pages).
 */

import { useMemo, useRef } from 'react'
import Link from 'next/link'
import { Plus, Folder, GraduationCap, Home, Sparkles, ArrowLeft } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { resolveDegrees } from '@/lib/degrees'
import { buildDegreeColumns, type DegreeColumn, type YearGroupColumn, type SemesterChip } from '@/lib/summaries-degree-columns'
import {
  useSvgTreeConnectors,
  type ConnectorHelpers,
  type ConnectorPoint,
} from '@/lib/use-svg-tree-connectors'
import type { Course } from '@/types'

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
  // viewport resize, and after the fadeUp/slideIn entry stagger.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  useSvgTreeConnectors(wrapRef, svgRef, drawDriveTree, [columns])

  return (
    <div className="drive-organize">

      {/* Info banner — title + "פרק וסדר" CTA. Replaces the old
          purple/violet header from the v1 design (per CLAUDE_CODE_HANDOFF
          §10: "Delete the old purple/violet header pill"). */}
      <div className="do-banner">
        <div className="do-banner-text">
          <div className="do-banner-title">סדר תיקיות שיעורים בכל הקורסים בבת אחת</div>
          <div className="do-banner-desc">
            נסרוק את תיקיות השיעורים בכל קורס, נציע אילו שבועות לקבץ לתת-תיקיות, ונקבל ממך אישור לפני שעושים שינויים ב-Drive.
          </div>
        </div>
        <div className="do-banner-actions">
          <Link href="/courses/extract" className="do-banner-secondary" prefetch={false} title="הוסף קורס חדש ידנית">
            <Plus size={16} />
            הוסף קורס
          </Link>
          <Link href="/courses/classify" className="do-banner-action" prefetch={false}>
            <Folder size={16} />
            פרק וסדר
          </Link>
        </div>
      </div>

      {/* Classify banner — shown only when there's something to triage,
          so users with an already-clean library don't see permanent
          banner clutter. */}
      {unclassifiedCount > 0 && (
        <Link href="/courses/classify" className="do-classify-banner" prefetch={false}>
          <div className="do-classify-icon"><Sparkles size={18} /></div>
          <div className="do-classify-text">
            <strong>יש לך {unclassifiedCount} קורסים לא מסווגים</strong>
            <span>סווג שנה + סמסטר בבת אחת והקבצים יסתדרו אוטומטית בתיקיות הנכונות.</span>
          </div>
          <div className="do-classify-cta">
            סווג עכשיו <ArrowLeft size={16} />
          </div>
        </Link>
      )}

      {/* Tree card — the actual 4-level visualization */}
      <div className="do-tree-card" ref={wrapRef}>
        <svg
          ref={svgRef}
          className="tree-svg"
          aria-hidden
          xmlns="http://www.w3.org/2000/svg"
        />

        {/* Level 1: teepo root */}
        <div className="tree-root">
          <Link href="/summaries" className="node root" prefetch={false}>
            <Home className="ico" />
            <span className="name">teepo</span>
            <span className="count">
              {columns.degrees.length} {columns.degrees.length === 1 ? 'תואר' : 'תארים'}
            </span>
          </Link>
        </div>

        {/* Levels 2-4: degree → year → semester */}
        <div className="tree-branches" data-columns={columns.degrees.length}>
          {columns.degrees.map((degree) => (
            <DegreeColumnView key={degree.id} degree={degree} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Subtrees
// ──────────────────────────────────────────────────────────────────────

function DegreeColumnView({ degree }: { degree: DegreeColumn }) {
  // Hide the "ללא שנה" + "לא מסווגים" buckets from the tree — they're
  // handled by the classify banner above. The degree pill stays even if
  // the user hasn't named their degree (renders as "תואר" placeholder)
  // so the tree shape is consistent across users.
  const realYears = degree.yearGroups.filter((yg) => yg.yearKey !== 'unclassified')
  const semesterCount = realYears.reduce((acc, yg) => acc + yg.chips.length, 0)

  return (
    <div className="degree-column">
      <div className="degree-header">
        <button className="node degree" type="button" aria-label={degree.name || 'תואר'}>
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
    <div className="year-group">
      <div className="year-header">
        <button className="node year" type="button" aria-label={group.yearLabel}>
          <GraduationCap className="ico" />
          <span className="name">{group.yearLabel}</span>
          <span className="count">
            {group.chips.length} {group.chips.length === 1 ? 'סמסטר' : 'סמסטרים'}
          </span>
        </button>
      </div>
      {group.chips.length > 0 && (
        <div className="semester-row" data-chips={group.chips.length}>
          {group.chips.map((chip) => (
            <SemChipNode key={chip.key} chip={chip} />
          ))}
        </div>
      )}
    </div>
  )
}

function SemChipNode({ chip }: { chip: SemesterChip }) {
  // Each chip deep-links into /summaries with the chip preselected.
  // The query param matches the activeChipKey state on the summaries page.
  const href = `/summaries?chip=${encodeURIComponent(chip.key)}`
  return (
    <Link href={href} className="node sem" prefetch={false} title={chip.label}>
      <Folder className="ico" />
      <span className="name">{chip.label}</span>
      <span className="count">{chip.bucket.courses.length}</span>
    </Link>
  )
}

// ──────────────────────────────────────────────────────────────────────
// SVG draw callback — the rounded-elbow version from
// teepo-design/mockup_drive_organize.html (different from the straight-
// line + joiner-bar style on /summaries — the spec calls for the curved
// elbow look on this page specifically).
// ──────────────────────────────────────────────────────────────────────

function drawDriveTree(h: ConnectorHelpers): void {
  const root = h.wrap.querySelector('.tree-root .node.root')
  if (!root) return
  const rb = h.center(root, 'bottom')

  // Level 1 → 2: root → each degree pill (elbow curve).
  const degrees = Array.from(h.wrap.querySelectorAll('.degree-header .node.degree')) as HTMLElement[]
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
    const yearPills = Array.from(col.querySelectorAll('.year-header .node.year')) as HTMLElement[]
    yearPills.forEach((y) => {
      const yt = h.center(y, 'top')
      h.path(h.elbow(db.x, db.y, yt.x, yt.y))
    })

    // Level 3 → 4: each year → its semester chips.
    col.querySelectorAll('.year-group').forEach((yg) => {
      const yh = yg.querySelector('.year-header .node.year')
      if (!yh) return
      const yb = h.center(yh, 'bottom')
      const chips = Array.from(yg.querySelectorAll('.semester-row .node.sem')) as HTMLElement[]
      if (chips.length === 0) return
      h.dot(yb.x, yb.y, 2.5)
      chips.forEach((s) => {
        const st = h.center(s, 'top')
        h.path(h.elbow(yb.x, yb.y, st.x, st.y))
      })
    })
  })
}
