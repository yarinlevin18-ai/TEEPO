'use client'

/**
 * <BulkOrganizeLessonsCTA /> — one-click "organize שיעורים across every
 * course" action for the /summaries page.
 *
 * The per-course flow (button inside each שיעורים folder, shipped with
 * the lesson-grouping feature) is great for a single course but tedious
 * across a full degree. This component scans every course that has a
 * lessons folder, runs the same `groupFilesByLesson` detection, and
 * shows a single confirmation modal listing every proposed sub-folder
 * grouped by course. One confirm → executes the whole plan with live
 * progress.
 *
 * Scope: only touches שיעורים folders. מטלות + סיכומים are left alone
 * because they don't follow the Week-N convention.
 */

import { useState } from 'react'
import { ListTree, Folder, X, Loader2 } from 'lucide-react'
import type { Course } from '@/types'
import { useAuth } from '@/lib/auth-context'
import { listFolderFiles, moveFile } from '@/lib/drive-files'
import { ensureSubfolder } from '@/lib/drive-folders'
import { groupFilesByLesson, type LessonGroup } from '@/lib/lesson-grouping'

interface CoursePlan {
  course: Course
  lessonsFolderId: string
  groups: LessonGroup[]
}

export default function BulkOrganizeLessonsCTA({ courses }: { courses: Course[] }) {
  const { googleToken, refreshGoogleToken } = useAuth()
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null)
  const [plan, setPlan] = useState<CoursePlan[] | null>(null)
  const [open, setOpen] = useState(false)
  const [executing, setExecuting] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  // Only courses that actually have a שיעורים folder ID are candidates.
  // No folder → nothing to scan; the create-folders CTA above handles that.
  const candidates = courses.filter(
    c => (c.drive_folder_ids as any)?.lessons,
  )

  if (candidates.length === 0) return null

  const getToken = async (): Promise<string | null> => {
    if (googleToken) return googleToken
    return refreshGoogleToken()
  }

  /** Pass 1 — list each lessons folder + detect groupings without writing. */
  const scan = async () => {
    setError(null)
    setDoneMsg(null)
    setScanning({ done: 0, total: candidates.length })
    const tok = await getToken()
    if (!tok) {
      setError('לא ניתן להתחבר ל-Drive')
      setScanning(null)
      return
    }
    const plans: CoursePlan[] = []
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]
      const fid = (c.drive_folder_ids as any).lessons as string
      try {
        const files = await listFolderFiles(tok, fid)
        const r = groupFilesByLesson(files)
        if (r.groups.length > 0) {
          plans.push({ course: c, lessonsFolderId: fid, groups: r.groups })
        }
      } catch (e) {
        // Don't fail the whole scan if one course's folder lookup fails —
        // surface it but keep going.
        console.warn('[bulk-organize] scan failed', c.title, e)
      }
      setScanning({ done: i + 1, total: candidates.length })
    }
    setScanning(null)
    if (plans.length === 0) {
      setDoneMsg('כל תיקיות שיעורים כבר מאורגנות — לא נמצאו שיעורים שכדאי לקבץ.')
      setTimeout(() => setDoneMsg(null), 4500)
      return
    }
    setPlan(plans)
    setOpen(true)
  }

  /** Pass 2 — create the sub-folders + move the files. */
  const execute = async () => {
    if (!plan) return
    setError(null)
    const totalFiles = plan.reduce(
      (n, p) => n + p.groups.reduce((m, g) => m + g.files.length, 0),
      0,
    )
    setExecuting({ done: 0, total: totalFiles })
    const tok = await getToken()
    if (!tok) {
      setError('לא ניתן להתחבר ל-Drive')
      setExecuting(null)
      return
    }
    let done = 0
    let failures = 0
    for (const p of plan) {
      for (const g of p.groups) {
        try {
          const subId = await ensureSubfolder(tok, g.folderName, p.lessonsFolderId)
          for (const f of g.files) {
            try {
              await moveFile(tok, f.id, subId, p.lessonsFolderId)
            } catch (e) {
              console.warn('[bulk-organize] move failed', f.name, e)
              failures++
            }
            done++
            setExecuting({ done, total: totalFiles })
          }
        } catch (e) {
          console.warn('[bulk-organize] folder ensure failed', g.folderName, e)
          // Count all files in this group as failures since they didn't move.
          failures += g.files.length
          done += g.files.length
          setExecuting({ done, total: totalFiles })
        }
      }
    }
    setExecuting(null)
    if (failures > 0) {
      setError(`${failures} קבצים לא הועברו — נסה שוב או בדוק ב-Drive.`)
    } else {
      setOpen(false)
      setPlan(null)
      const folderCount = plan.reduce((n, p) => n + p.groups.length, 0)
      setDoneMsg(`סודר! ${folderCount} תיקיות שיעורים נוצרו.`)
      setTimeout(() => setDoneMsg(null), 4500)
    }
  }

  const totalGroups = plan?.reduce((n, p) => n + p.groups.length, 0) ?? 0
  const totalFiles = plan?.reduce(
    (n, p) => n + p.groups.reduce((m, g) => m + g.files.length, 0),
    0,
  ) ?? 0

  return (
    <>
      <div className="bulk-org-cta">
        <div className="bulk-org-cta-body">
          <strong>
            {scanning
              ? `סורק קורסים… ${scanning.done}/${scanning.total}`
              : doneMsg
                ? doneMsg
                : 'סדר תיקיות שיעורים בכל הקורסים בבת אחת'}
          </strong>
          <small>
            נסרוק את תיקיית שיעורים בכל קורס, נציע איזה שבועות כדאי לקבץ
            לתת-תיקיות, ונקבל ממך אישור לפני שעושים שינויים ב-Drive.
          </small>
        </div>
        <button
          type="button"
          className="bulk-org-cta-btn"
          onClick={scan}
          disabled={!!scanning}
        >
          {scanning ? (
            <><Loader2 size={14} className="spin" /> סורק…</>
          ) : (
            <><ListTree size={14} /> סרוק וסדר</>
          )}
        </button>
      </div>

      {open && plan && (
        <div
          className="drive-organize-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="סדר תיקיות שיעורים"
          onClick={(e) => {
            if (e.target === e.currentTarget && !executing) {
              setOpen(false)
              setPlan(null)
            }
          }}
        >
          <div className="drive-organize-modal bulk-org-modal" dir="rtl">
            <header className="drive-organize-head">
              <h3>סדר תיקיות שיעורים בכל הקורסים</h3>
              <button
                type="button"
                className="drive-icon-btn"
                onClick={() => { setOpen(false); setPlan(null) }}
                disabled={!!executing}
                aria-label="סגור"
              >
                <X size={16} />
              </button>
            </header>

            <p className="drive-organize-help">
              מצאתי <strong>{totalGroups}</strong> שיעורים ב-{plan.length} קורסים שכדאי
              לקבץ. סך הכל <strong>{totalFiles}</strong> קבצים יעברו לתת-תיקיות
              חדשות. הפעולה הפיכה מתוך Drive עצמו.
            </p>

            <div className="drive-organize-groups">
              {plan.map(p => (
                <div className="bulk-org-course" key={p.course.id}>
                  <div className="bulk-org-course-head">
                    <strong>{p.course.title}</strong>
                    <span className="drive-organize-count">
                      {p.groups.length} שיעורים
                    </span>
                  </div>
                  {p.groups.map(g => (
                    <div className="drive-organize-group" key={g.key}>
                      <div className="drive-organize-group-head">
                        <Folder size={14} />
                        <strong>{g.folderName}</strong>
                        <span className="drive-organize-count">
                          {g.files.length} קבצים
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {error && <div className="drive-organize-error">{error}</div>}

            {executing && (
              <div className="drive-organize-progress">
                מעביר… {executing.done}/{executing.total}
              </div>
            )}

            <footer className="drive-organize-foot">
              <button
                type="button"
                onClick={() => { setOpen(false); setPlan(null) }}
                disabled={!!executing}
              >
                ביטול
              </button>
              <button
                type="button"
                className="primary"
                onClick={execute}
                disabled={!!executing}
              >
                {executing
                  ? 'מסדר…'
                  : `סדר ${totalGroups} שיעורים`}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
