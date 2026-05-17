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

import { useEffect } from 'react'
import {
  X, FileText, Code, BarChart2, CheckCircle2, ExternalLink,
  RotateCw, AlertCircle, Loader2,
} from 'lucide-react'

export type SyncStage = 'idle' | 'progress' | 'results' | 'error'

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
  onRetry: () => void
  onClose: () => void
}

export default function SyncResultsModal({
  stage, progress, results, error, onRetry, onClose,
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
                  <CheckCircle2 size={20} />}
            </div>
            <div>
              <h2 id="sync-modal-title">
                {stage === 'progress' ? 'סורק את Moodle…'
                  : stage === 'error' ? 'הסנכרון נכשל'
                    : isEmptyResults ? 'הכל מסונכרן'
                      : 'סנכרון הושלם'}
              </h2>
              <div className="sub">
                {stage === 'progress' ? 'מחפש מטלות, חומרים וציונים חדשים'
                  : stage === 'error' ? 'נסה שוב או בדוק את החיבור ל-Moodle'
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
