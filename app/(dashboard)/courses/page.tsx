'use client'

/**
 * /courses — DriveOrganize tree (v3 locked design).
 *
 * Source: teepo-design/mockup_drive_organize.html. The whole 1,475-line
 * flat-list + filter + edit-modal + sorting-game implementation that
 * used to live here was replaced by a single <DriveOrganize /> component
 * (4-level tree: teepo → degree → year → semester).
 *
 * Where the old features went:
 *   - "+ הוסף קורס" (manual create) → /courses/extract (linked from the
 *     info banner inside DriveOrganize)
 *   - "סווג ידנית" (bulk classify)  → /courses/classify (linked from
 *     the classify banner inside DriveOrganize)
 *   - "ערוך קורס" (per-course edit) → /courses/[id] (drill into a course)
 *   - Search + department filter   → /summaries handles the per-semester
 *     course list; this page is purely the org-chart browse view
 *
 * Authentication + DBProvider live in the parent (dashboard) layout —
 * this page just renders the tree.
 */

import DriveOrganize from '@/components/DriveOrganize'

export default function CoursesPage() {
  return <DriveOrganize />
}
