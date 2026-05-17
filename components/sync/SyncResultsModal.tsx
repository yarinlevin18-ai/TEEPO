'use client'

/**
 * SyncResultsModal — the modal that backs the SyncAllButton.
 *
 * Three states (driven by the `stage` prop):
 *   - 'progress' → spinner + progress bar + "checking [course] · N of M"
 *   - 'results'  → summary tiles + grouped-by-course list of new items
 *                  with kind badges (assignment / file / grade) and
 *                  "פתח" / "פתח ב-Drive" / "צפייה" actions
 *   - 'error'    → red banner with `error` text + "נסה שוב" button
 *
 * Closed entirely when `stage === 'idle'` — caller sets that to dismiss.
 *
 * Matches `mockups/assignments.html` `#syncModal`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  X, FileText, Code, BarChart2, CheckCircle2, ExternalLink,
  RotateCw, AlertCircle, Loader2, Link2Off, Download, Puzzle, ArrowDownToLine,
} from 'lucide-react'
import {
  probeExtension,
  syncFileViaExtension,
  EXTENSION_INSTALL_URL,
  type ExtensionPresence,
} from '@/lib/extension-bridge'

export type SyncStage = 'idle' | 'progress' | 'results' | 'error' | 'not_connected'

export interface SyncProgress {
  current: number
  total: number
  label: string // course name being scanned
}

export interface SyncResultItem {
  title: string
  url?: string
  type?: string
  filesize?: number
  section?: string
  deadline?: string | null
  grade?: number | null
  grade_text?: string | null
  course_name?: string
}

export interface SyncCourseResult {
  course_id?: string | null
  moodle_id: string
  course_name: string
  course_color?: string | null
  new_assignments: SyncResultItem[]
  new_files: SyncResultItem[]
  new_grades: SyncResultItem[]
  error?: string | null
}

export interface SyncResultsPayload {
  courses_scanned: number
  synced_at: string
  /** False when the user hasn't connected Moodle — drives the "connect" CTA. */
  moodle_connected?: boolean
  /** Human-readable reason when moodle_connected is false. */
  moodle_error?: string | null
  results: SyncCourseResult[]
  totals: {
    new_assignments: number
    new_files: number
    new_grades: number
  }
}

interface Props {
  stage: SyncStage
  progress: SyncProgress | null
  results: SyncResultsPayload | null
  error: string | null
  /** Human-readable reason when stage === 'not_connected'. */
  notConnectedReason?: string | null
  onRetry: () => void
  onClose: () => void
}

type DriveTransferStatus = 'idle' | 'running' | 'done'
interface FileTransferState {
  total: number
  done: number
  failed: number
  status: DriveTransferStatus
}

export default function SyncResultsModal({
  stage, progress, results, error, notConnectedReason, onRetry, onClose,
}: Props) {
  // Lock body scroll while open + escape-to-close
  useEffect(() => {
    if (stage === 'idle') return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage !== 'progress') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [stage, onClose])

  // Extension presence — re-probed each time the modal lands on the
  // results state. We don't probe at component-mount because the extension
  // service worker has cold-start latency and we'd risk false-negatives
  // before the user could actually want it.
  const [extension, setExtension] = useState<ExtensionPresence | null>(null)
  useEffect(() => {
    if (stage !== 'results') return
    let cancelled = false
    probeExtension().then((p) => { if (!cancelled) setExtension(p) })
    return () => { cancelled = true }
  }, [stage])

  // Files the extension can move. Only courses with a `course_id` are
  // included — without it we can't ask the extension to resolve a Drive
  // folder.
  const transferableFiles = useMemo(() => {
    if (!results) return [] as Array<{
      courseId: string
      courseName: string
      file: { url: string; filename: string; mimeType?: string }
    }>
    const out: Array<{
      courseId: string
      courseName: string
      file: { url: string; filename: string; mimeType?: string }
    }> = []
    for (const c of results.results) {
      if (!c.course_id) continue
      for (const f of c.new_files) {
        if (!f.url || !f.title) continue
        out.push({
          courseId: c.course_id,
          courseName: c.course_name,
          file: {
            url: f.url,
            filename: f.title,
            mimeType: (f as { mimeType?: string }).mimeType,
          },
        })
      }
    }
    return out
  }, [results])

  const [transfer, setTransfer] = useState<FileTransferState>({ total: 0, done: 0, failed: 0, status: 'idle' })

  // Reset transfer state whenever the modal re-opens with fresh results.
  useEffect(() => {
    if (stage === 'results') setTransfer({ total: 0, done: 0, failed: 0, status: 'idle' })
  }, [stage, results])

  const sendFilesToDrive = useCallback(async () => {
    if (!extension?.available || transferableFiles.length === 0) return
    setTransfer({ total: transferableFiles.length, done: 0, failed: 0, status: 'running' })
    // Sequential — Drive throttles parallel writes to the same parent
    // folder, and the per-file progress reads cleaner. Per-file failures
    // are isolated so a single bad URL doesn't sink the batch.
    let done = 0
    let failed = 0
    for (const entry of transferableFiles) {
      const r = await syncFileViaExtension({
        file: entry.file,
        courseId: entry.courseId,
        kind: 'lessons',
      })
      if (r.ok) done++
      else failed++
      setTransfer({ total: transferableFiles.length, done, failed, status: 'running' })
    }
    setTransfer({ total: transferableFiles.length, done, failed, status: 'done' })
  }, [extension?.available, transferableFiles])

  if (stage === 'idle') return null

  const totalNew = results
    ? results.totals.new_assignments + results.totals.new_files + results.totals.new_grades
    : 0
  const isEmptyResults = stage === 'results' && totalNew === 0

  return (
    <div
      className="sync-modal-overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget && stage !== 'progress') onClose() }}
    >
      <div className="sync-modal">
        <header className="sync-modal-head">
          <div className="sync-modal-head-left">
            <div className="sync-modal-head-icon">
              {stage === 'error' ? <AlertCircle size={20} /> :
                stage === 'progress' ? <Loader2 size={20} className="sync-icon-spin" /> :
                  stage === 'not_connected' ? <Link2Off size={20} /> :
                    <CheckCircle2 size={20} />}
            </div>
            <div>
              <h2 id="sync-modal-title">
                {stage === 'progress' ? 'סורק את Moodle…'
                  : stage === 'error' ? 'הסנכרון נכשל'
                    : stage === 'not_connected' ? 'Moodle לא מחובר'
                      : isEmptyResults ? 'הכל מסונכרן'
                        : 'סנכרון הושלם'}
              </h2>
              <div className="sub">
                {stage === 'progress' ? 'מחפש מטלות, חומרים וציונים חדשים'
                  : stage === 'error' ? 'נסה שוב או בדוק את החיבור ל-Moodle'
                    : stage === 'not_connected' ? 'צריך להתחבר ל-Moodle כדי לסרוק את הקורסים'
                      : results
                        ? `סרקנו ${results.courses_scanned} קורסים · נמצאו ${totalNew} פריטים חדשים`
                        : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="sync-modal-close"
            onClick={onClose}
            disabled={stage === 'progress'}
            aria-label="סגור"
          >
            <X size={16} />
          </button>
        </header>

        {/* PROGRESS */}
        {stage === 'progress' && (
          <div className="sync-progress">
            <div className="sync-progress-spinner" aria-hidden />
            <h3>סורק את Moodle…</h3>
            <p>זה עשוי לקחת 30–60 שניות</p>
            <div className="sync-progress-bar">
              <div
                className="sync-progress-bar-fill"
                style={{ width: `${progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 5}%` }}
              />
            </div>
            <div className="sync-progress-step">
              בודק <strong>{progress?.label || '…'}</strong>
              {progress ? ` · ${progress.current} מתוך ${progress.total} קורסים` : ''}
            </div>
          </div>
        )}

        {/* ERROR */}
        {stage === 'error' && (
          <div className="sync-error">
            <div className="sync-error-banner">
              <AlertCircle size={16} />
              <span>{error || 'אירעה שגיאה במהלך הסנכרון.'}</span>
            </div>
            <button type="button" className="asn-btn asn-btn-primary" onClick={onRetry}>
              <RotateCw size={15} /> נסה שוב
            </button>
          </div>
        )}

        {/* NOT CONNECTED — Moodle cookies missing on the backend */}
        {stage === 'not_connected' && (
          <div className="sync-not-connected">
            <Link2Off size={48} className="sync-not-connected-ico" />
            <h3>צריך לחבר את Moodle</h3>
            <p>
              {notConnectedReason || 'הסשן של Moodle בשרת לא קיים או פג. גש להגדרות החיבור והתחבר מחדש כדי שנוכל לסרוק את הקורסים שלך.'}
            </p>
            <div className="sync-not-connected-actions">
              <Link href="/moodle" className="asn-btn asn-btn-primary" onClick={onClose}>
                התחבר ל-Moodle
                <ExternalLink size={14} />
              </Link>
              <button type="button" className="asn-btn asn-btn-ghost" onClick={onRetry}>
                <RotateCw size={14} /> בדוק שוב
              </button>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {stage === 'results' && results && !isEmptyResults && (
          <>
            <div className="sync-summary">
              <div className="sync-sum-card">
                <div className="sync-sum-num">{results.totals.new_assignments}</div>
                <div className="sync-sum-label">מטלות חדשות</div>
              </div>
              <div className="sync-sum-card">
                <div className="sync-sum-num">{results.totals.new_files}</div>
                <div className="sync-sum-label">קבצי חומר</div>
              </div>
              <div className="sync-sum-card">
                <div className="sync-sum-num">{results.totals.new_grades}</div>
                <div className="sync-sum-label">ציונים חדשים</div>
              </div>
            </div>

            <ExtensionBridgeCTA
              extension={extension}
              transferableCount={transferableFiles.length}
              transfer={transfer}
              onSend={sendFilesToDrive}
            />

            <div className="sync-modal-body">
              {results.results.map((course) => {
                const courseTotal =
                  course.new_assignments.length + course.new_files.length + course.new_grades.length
                if (courseTotal === 0 && !course.error) return null
                return (
                  <section className="sync-course-block" key={course.moodle_id || course.course_name}>
                    <div className="sync-course-block-head">
                      <span
                        className="sync-course-block-dot"
                        style={{ background: course.course_color || 'var(--lp-muted)' }}
                      />
                      <h3>{course.course_name}</h3>
                      <small>{courseTotal} פריטים</small>
                    </div>
                    {course.error && (
                      <div className="sync-course-error">
                        <AlertCircle size={13} /> {course.error}
                      </div>
                    )}
                    {course.new_assignments.map((a, i) => (
                      <NewItemRow
                        key={`a-${i}`}
                        kind="assignment"
                        title={a.title}
                        sub={`מטלה חדשה${a.deadline ? ` · הגשה: ${formatDate(a.deadline)}` : ''}`}
                        href={a.url}
                        actionLabel="פתח"
                      />
                    ))}
                    {course.new_files.map((f, i) => (
                      <NewItemRow
                        key={`f-${i}`}
                        kind="file"
                        title={f.title}
                        sub={
                          [
                            f.filesize ? formatBytes(f.filesize) : null,
                            f.section || null,
                          ].filter(Boolean).join(' · ')
                        }
                        href={f.url}
                        actionLabel="פתח ב-Drive"
                      />
                    ))}
                    {course.new_grades.map((g, i) => (
                      <NewItemRow
                        key={`g-${i}`}
                        kind="grade"
                        title={`ציון: ${g.grade ?? g.grade_text ?? '—'}`}
                        sub={g.course_name ? `${g.course_name}` : 'עודכן הציון בפורטל'}
                        actionLabel="צפייה"
                      />
                    ))}
                  </section>
                )
              })}
            </div>
          </>
        )}

        {/* RESULTS — empty state */}
        {stage === 'results' && results && isEmptyResults && (
          <div className="sync-empty">
            <CheckCircle2 size={48} className="sync-empty-ico" />
            <h3>הכל מסונכרן · אין פריטים חדשים</h3>
            <p>
              סרקנו {results.courses_scanned} קורסים. הסנכרון האחרון:{' '}
              <strong>{formatDate(results.synced_at)}</strong>
            </p>
          </div>
        )}

        <footer className="sync-modal-foot">
          <span className="sync-modal-foot-note">
            {stage === 'results'
              ? <>הכל נשמר ב-Drive תחת תיקיית <strong>TEEPO</strong></>
              : ''}
          </span>
          <button
            type="button"
            className="asn-btn asn-btn-primary"
            onClick={onClose}
            disabled={stage === 'progress'}
          >
            סגור
          </button>
        </footer>
      </div>
    </div>
  )
}

function NewItemRow({
  kind, title, sub, href, actionLabel,
}: {
  kind: 'assignment' | 'file' | 'grade'
  title: string
  sub: string
  href?: string
  actionLabel: string
}) {
  const Icon = kind === 'assignment' ? CheckCircle2 : kind === 'grade' ? BarChart2 :
    /\.(py|js|ts|cpp|c|java|sh)$/i.test(title) ? Code : FileText
  const Action: any = href ? 'a' : 'button'
  const actionProps = href
    ? { href, target: '_blank', rel: 'noopener noreferrer' as const }
    : { type: 'button' as const }
  return (
    <div className="sync-new-item">
      <span className="sync-new-badge">חדש</span>
      <div className={`sync-ni-icon ${kind}`}><Icon size={15} /></div>
      <div className="sync-ni-meta">
        <div className="sync-ni-title">{title}</div>
        {sub && <div className="sync-ni-sub">{sub}</div>}
      </div>
      <Action className="sync-ni-action" {...actionProps}>
        {actionLabel}
        <ExternalLink size={12} />
      </Action>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─────────────────────────────────────────────────────────────────────────
// ExtensionBridgeCTA — the "send X files to Drive" panel that hands off
// the file-transfer work to the Chrome extension after the backend has
// identified what's new. Three visual states:
//   - extension available + files to send → green CTA button
//   - extension available + transfer running → progress strip
//   - extension available + transfer done → result summary
//   - extension NOT available → muted "install the extension" prompt
//   - no transferable files → entire block is hidden
// ─────────────────────────────────────────────────────────────────────────

function ExtensionBridgeCTA({
  extension, transferableCount, transfer, onSend,
}: {
  extension: ExtensionPresence | null
  transferableCount: number
  transfer: { total: number; done: number; failed: number; status: 'idle' | 'running' | 'done' }
  onSend: () => void
}) {
  // Hide if backend didn't surface any movable files at all
  if (transferableCount === 0) return null

  // Probe still pending — render a slim placeholder so the layout doesn't
  // jump when the result lands.
  if (extension === null) {
    return (
      <div className="sync-bridge sync-bridge-checking">
        <Loader2 size={14} className="sync-icon-spin" />
        <span>בודק אם התוסף של TEEPO מותקן…</span>
      </div>
    )
  }

  // Extension not installed / not Chrome — show install/help link.
  if (!extension.available) {
    return (
      <div className="sync-bridge sync-bridge-missing">
        <div className="sync-bridge-icon"><Puzzle size={18} /></div>
        <div className="sync-bridge-text">
          <strong>נמצאו {transferableCount} קבצים חדשים ב-Moodle</strong>
          <span>התוסף של TEEPO ב-Chrome מעביר אותם ישירות ל-Drive. התקן אותו כדי להעביר בלחיצה אחת.</span>
        </div>
        <a
          href={EXTENSION_INSTALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="asn-btn asn-btn-ghost"
        >
          התקן את התוסף
          <ExternalLink size={13} />
        </a>
      </div>
    )
  }

  // Running transfer — progress bar
  if (transfer.status === 'running') {
    const pct = transfer.total > 0 ? (transfer.done + transfer.failed) / transfer.total * 100 : 0
    return (
      <div className="sync-bridge sync-bridge-running">
        <div className="sync-bridge-row">
          <Loader2 size={16} className="sync-icon-spin" />
          <span>מעביר ל-Drive · <strong>{transfer.done + transfer.failed}</strong> מתוך {transfer.total}</span>
          {transfer.failed > 0 && <span className="sync-bridge-failed">{transfer.failed} נכשלו</span>}
        </div>
        <div className="sync-bridge-bar">
          <div className="sync-bridge-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  // Done — result summary
  if (transfer.status === 'done') {
    return (
      <div className={`sync-bridge sync-bridge-done${transfer.failed > 0 ? ' has-errors' : ''}`}>
        <div className="sync-bridge-icon">
          {transfer.failed === 0 ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        </div>
        <div className="sync-bridge-text">
          <strong>
            הועברו {transfer.done} מתוך {transfer.total} ל-Drive
            {transfer.failed > 0 ? ` · ${transfer.failed} נכשלו` : ''}
          </strong>
          <span>
            {transfer.failed > 0
              ? 'הקבצים שנכשלו עדיין נגישים דרך הקישורים למטה — אפשר להעלות ידנית או לנסות שוב.'
              : 'הקבצים נשמרו תחת תיקיית הקורס המתאימה ב-TEEPO/Drive.'}
          </span>
        </div>
        {transfer.failed > 0 && (
          <button type="button" className="asn-btn asn-btn-ghost" onClick={onSend}>
            <RotateCw size={13} /> נסה שוב
          </button>
        )}
      </div>
    )
  }

  // Idle — green CTA to start the transfer
  return (
    <div className="sync-bridge sync-bridge-ready">
      <div className="sync-bridge-icon"><Download size={18} /></div>
      <div className="sync-bridge-text">
        <strong>שלח {transferableCount} קבצים ל-Drive</strong>
        <span>התוסף יוריד מ-Moodle ויעלה ישירות ל-TEEPO/Drive בשם הקורס.</span>
      </div>
      <button type="button" className="asn-btn asn-btn-primary" onClick={onSend}>
        <ArrowDownToLine size={14} /> שלח עכשיו
      </button>
    </div>
  )
}
