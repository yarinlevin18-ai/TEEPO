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
 *
 * Feedback model: scan + execute results (success, "nothing to organize",
 * error) are surfaced in a status pill BELOW the CTA banner that the
 * user has to actively dismiss. Earlier versions only rendered errors
 * inside the preview modal — when a scan failed before the modal
 * opened, the error was silently swallowed and the user saw the spinner
 * end with no explanation. Same for the "already organized" case which
 * auto-dismissed too quickly to read.
 */

import { useState } from 'react'
import { ListTree, Folder, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
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

type Status =
  | { kind: 'success'; msg: string }
  | { kind: 'info'; msg: string }
  | { kind: 'error'; msg: string }

export default function BulkOrganizeLessonsCTA({ courses }: { courses: Course[] }) {
  const { googleToken, refreshGoogleToken } = useAuth()
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null)
  const [plan, setPlan] = useState<CoursePlan[] | null>(null)
  const [open, setOpen] = useState(false)
  const [executing, setExecuting] = useState<{ done: number; total: number } | null>(null)
  // Status pill shown below the CTA banner. Stays until user dismisses
  // (or a new action replaces it) so it can't be missed.
  const [status, setStatus] = useState<Status | null>(null)

  // Only courses that actually have a שיעורים folder ID are candidates.
  // No folder → nothing to scan; the create-folders CTA above handles that.
  const candidates = courses.filter(
    c => (c.drive_folder_ids as any)?.lessons,
  )

  // When the user has no courses with provisioned folders yet, still show
  // the banner in a disabled state with a hint pointing at /summaries'
  // "צור תיקיות" CTA above. (Previously we returned null, which made the
  // user think the feature was missing.)
  const hasCandidates = candidates.length > 0

  const getToken = async (): Promise<string | null> => {
    if (googleToken) return googleToken
    return refreshGoogleToken()
  }

  /** Pass 1 — list each lessons folder + detect groupings without writing. */
  const scan = async () => {
    setStatus(null)
    setScanning({ done: 0, total: candidates.length })
    const tok = await getToken()
    if (!tok) {
      setStatus({
        kind: 'error',
        msg: 'לא ניתן להתחבר ל-Drive — נסה לצאת ולהתחבר מחדש כדי לרענן את ההרשאה.',
      })
      setScanning(null)
      return
    }
    const plans: CoursePlan[] = []
    const failures: string[] = []
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
        failures.push(c.title)
        console.warn('[bulk-organize] scan failed', c.title, e)
      }
      setScanning({ done: i + 1, total: candidates.length })
    }
    setScanning(null)
    if (plans.length === 0) {
      if (failures.length > 0) {
        setStatus({
          kind: 'error',
          msg: `הסריקה לא הצליחה ל-${failures.length} קורסים. בדוק שיש לך הרשאה ל-Drive ונסה שוב.`,
        })
      } else {
        setStatus({
          kind: 'info',
          msg: `סרקתי ${candidates.length} קורסים — אין קבצים שכדאי לקבץ לתת-תיקיות (צריך שמות כמו "Week 1" / "שיעור 1").`,
        })
      }
      return
    }
    setPlan(plans)
    setOpen(true)
  }

  /** Pass 2 — create the sub-folders + move the files. */
  const execute = async () => {
    if (!plan) return
    const totalFiles = plan.reduce(
      (n, p) => n + p.groups.reduce((m, g) => m + g.files.length, 0),
      0,
    )
    setExecuting({ done: 0, total: totalFiles })
    const tok = await getToken()
    if (!tok) {
      setStatus({ kind: 'error', msg: 'לא ניתן להתחבר ל-Drive' })
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
          failures += g.files.length
          done += g.files.length
          setExecuting({ done, total: totalFiles })
        }
      }
    }
    setExecuting(null)
    if (failures > 0) {
      setStatus({
        kind: 'error',
        msg: `${failures} קבצים לא הועברו — נסה שוב או בדוק ב-Drive.`,
      })
    } else {
      setOpen(false)
      setPlan(null)
      const folderCount = plan.reduce((n, p) => n + p.groups.length, 0)
      setStatus({
        kind: 'success',
        msg: `סודר! ${folderCount} תיקיות שיעורים נוצרו (${totalFiles} קבצים).`,
      })
    }
  }

  const totalGroups = plan?.reduce((n, p) => n + p.groups.length, 0) ?? 0
  const totalFiles = plan?.reduce(
    (n, p) => n + p.groups.reduce((m, g) => m + g.files.length, 0),
    0,
  ) ?? 0

  // Headline copy reflects current state so the user always knows where
  // they are: idle / scanning / "no work" / etc.
  const headline = scanning
    ? `סורק קורסים… ${scanning.done}/${scanning.total}`
    : !hasCandidates
      ? 'סדר תיקיות שיעורים — צריך תיקיות Drive תחילה'
      : 'סדר תיקיות שיעורים בכל הקורסים בבת אחת'

  return (
    <>
      <div className="bulk-org-cta">
        <div className="bulk-org-cta-body">
          <strong>{headline}</strong>
          <small>
            {hasCandidates
              ? 'נסרוק את תיקיית שיעורים בכל קורס, נציע איזה שבועות כדאי לקבץ לתת-תיקיות, ונקבל ממך אישור לפני שעושים שינויים ב-Drive.'
              : 'אין עדיין קורסים עם תיקיות Drive. סווג קורסים למעלה ולחץ "צור תיקיות" כדי שהפיצ׳ר הזה יהיה זמין.'}
          </small>
        </div>
        <button
          type="button"
          className="bulk-org-cta-btn"
          onClick={scan}
          disabled={!!scanning || !hasCandidates}
          title={!hasCandidates ? 'אין קורסים עם תיקיית שיעורים ב-Drive' : 'סרוק וסדר'}
        >
          {scanning ? (
            <><Loader2 size={14} className="spin" /> סורק…</>
          ) : (
            <><ListTree size={14} /> סרוק וסדר</>
          )}
        </button>
      </div>

      {/* Status pill — stays until dismissed (or replaced by a new
       *  action's result). Color-coded by kind. */}
      {status && (
        <div className={`bulk-org-status bulk-org-status-${status.kind}`}>
          {status.kind === 'success' && <CheckCircle2 size={14} />}
          {status.kind === 'info'    && <ListTree size={14} />}
          {status.kind === 'error'   && <AlertCircle size={14} />}
          <span>{status.msg}</span>
          <button
            type="button"
            className="bulk-org-status-close"
            onClick={() => setStatus(null)}
            aria-label="סגור"
          >
            <X size={13} />
          </button>
        </div>
      )}

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
