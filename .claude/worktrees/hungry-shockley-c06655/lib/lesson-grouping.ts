/**
 * Lesson grouping — detect "Week N" / "שיעור N" / "Lesson N" patterns in a
 * flat list of Drive files (typically the שיעורים folder of a course) and
 * propose per-lesson sub-folders so the user can collapse a long flat list
 * into a navigable tree.
 *
 * Pure helper, no Drive I/O. The UI calls this to render a preview, then
 * (on confirm) walks the result and calls Drive create-folder + move-file
 * for each group.
 *
 * Design rules:
 *  - A "group" must have ≥2 files. A single Week-1 file isn't worth its own
 *    sub-folder — leave it at the top level.
 *  - The folder name uses the lesson marker + the most informative topic
 *    extracted from the matching files (e.g. "Week 1 - Introduction").
 *  - Common Moodle suffixes (" File", " URL") are stripped when picking the
 *    topic so a File+URL pair for the same lesson doesn't dilute the topic
 *    count.
 *  - Optimistic tmp- placeholders (still uploading) never get grouped — they
 *    don't have stable Drive IDs to move.
 */

import type { DriveFile } from './drive-files'

export interface LessonGroup {
  /** Canonical key — "Week 1", "Lesson 3", "שיעור 5". Used for dedupe. */
  key: string
  /** Proposed folder name to create in Drive. Includes the topic if any. */
  folderName: string
  /** Files that belong in this group (already present in the parent folder). */
  files: DriveFile[]
}

export interface GroupingResult {
  groups: LessonGroup[]
  /** Files that don't match any lesson pattern (Syllabus, Objectives, …)
   *  OR matched a marker but were the only file with that key. */
  unmatched: DriveFile[]
}

/** Lesson marker keywords + their canonical display form. */
const MARKERS: Array<{ rx: RegExp; canonical: string }> = [
  { rx: /^week/i,    canonical: 'Week' },
  { rx: /^lesson/i,  canonical: 'Lesson' },
  { rx: /^שיעור/,    canonical: 'שיעור' },
]

/** Strip suffixes Moodle exports stick on the filename so equivalent
 *  resources collapse into one when picking a topic. */
const SUFFIX_RX = /\s+(file|url|pdf|docx?|pptx?|link)$/i

/** Try to detect a lesson marker at the start of `name`. */
export function detectLessonKey(name: string): { key: string; rest: string } | null {
  const trimmed = name.trim()
  for (const m of MARKERS) {
    if (!m.rx.test(trimmed)) continue
    // Match: <marker><any sep><number><any sep><rest>
    // Separator can be space/dash/em-dash/en-dash/colon/dot/semicolon/comma/underscore/parens.
    const full = trimmed.match(/^(\S+)\s*0*(\d+)\b[\s\-–—:.;,_)(]*([\s\S]*)$/)
    if (!full) continue
    const n = parseInt(full[2], 10)
    if (!Number.isFinite(n) || n < 0) continue
    return { key: `${m.canonical} ${n}`, rest: full[3].trim() }
  }
  return null
}

/** Pick the best topic label from the rests of the files in a group.
 *  Strategy: strip Moodle " File"/" URL" suffixes, count frequencies, take
 *  the most common (ties broken by length so the more descriptive label
 *  wins). Empty input → empty topic. */
export function pickTopic(rests: string[]): string {
  const cleaned = rests
    .map(r => r.replace(SUFFIX_RX, '').trim())
    .filter(Boolean)
  if (cleaned.length === 0) return ''
  const counts = new Map<string, number>()
  for (const c of cleaned) counts.set(c, (counts.get(c) ?? 0) + 1)
  const ranked = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length,
  )
  return ranked[0][0]
}

/**
 * Group `files` into lesson buckets. Files lacking a recognizable marker
 * (and lessons with only one file) end up in `unmatched`.
 */
export function groupFilesByLesson(files: DriveFile[]): GroupingResult {
  const buckets = new Map<string, { rests: string[]; files: DriveFile[] }>()
  const unmatched: DriveFile[] = []

  for (const f of files) {
    // Optimistic placeholders don't have a real Drive ID yet — leave them.
    if (f.id.startsWith('tmp-')) { unmatched.push(f); continue }
    const det = detectLessonKey(f.name)
    if (!det) { unmatched.push(f); continue }
    if (!buckets.has(det.key)) buckets.set(det.key, { rests: [], files: [] })
    const b = buckets.get(det.key)!
    if (det.rest) b.rests.push(det.rest)
    b.files.push(f)
  }

  const groups: LessonGroup[] = []
  for (const [key, b] of Array.from(buckets.entries())) {
    if (b.files.length < 2) {
      // Not worth a dedicated folder — keep at top level.
      unmatched.push(...b.files)
      continue
    }
    const topic = pickTopic(b.rests)
    const folderName = topic ? `${key} - ${topic}` : key
    groups.push({ key, folderName, files: b.files })
  }

  // Sort groups by lesson number — chronological order in the preview.
  groups.sort((a, b) => {
    const na = parseInt(a.key.match(/\d+/)?.[0] ?? '0', 10)
    const nb = parseInt(b.key.match(/\d+/)?.[0] ?? '0', 10)
    return na - nb
  })

  return { groups, unmatched }
}
