'use client'

/**
 * /courses/classify — bulk classification for newly-imported courses.
 *
 * After the Chrome extension dumps a batch from Moodle, courses without
 * a recognizable semester pattern land under TEEPO/לא מסווגים/. This
 * page lets the user assign year + semester to all of them at once and
 * then redirects to the now-organized TEEPO root in Drive.
 *
 * Per-row save is independent: a single failure (e.g. one Drive folder
 * move 403) doesn't abort the batch.
 */

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ExternalLink, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import type { Course } from '@/types'

type HebSemester = 'א' | 'ב' | 'קיץ'
type YearOfStudy = 1 | 2 | 3 | 4
type RowStatus = 'idle' | 'saving' | 'done' | 'error'

const SEMESTER_OPTIONS: Array<{ value: HebSemester; label: string }> = [
  { value: 'א', label: "סמסטר א'" },
  { value: 'ב', label: "סמסטר ב'" },
  { value: 'קיץ', label: 'קיץ' },
]
const YEAR_OPTIONS: Array<{ value: YearOfStudy; label: string }> = [
  { value: 1, label: "שנה א'" },
  { value: 2, label: "שנה ב'" },
  { value: 3, label: "שנה ג'" },
  { value: 4, label: "שנה ד'" },
]

interface DraftRow {
  year: YearOfStudy | ''
  semester: HebSemester | ''
  status: RowStatus
  error?: string
}

export default function ClassifyCoursesPage() {
  const router = useRouter()
  const { db, handle, ready, loading, reclassifyCourse } = useDB() as any

  // The "really unclassified" set: both year and semester missing. These are
  // the courses that currently live under TEEPO/לא מסווגים/ in Drive.
  const unclassified: Course[] = useMemo(() => {
    if (!ready) return []
    return (db?.courses ?? []).filter((c: Course) => !c.year_of_study && !c.semester)
  }, [db, ready])

  // Per-row draft state, keyed by course id. Seeded once when the page mounts
  // with the set of unclassified courses, then mutated by the pickers and
  // by the bulk-apply quick controls.
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>(() => ({}))

  // Keep drafts in sync as courses arrive (handle still loading on first
  // render). We don't clobber rows the user already touched.
  useMemo(() => {
    setDrafts(prev => {
      const next = { ...prev }
      for (const c of unclassified) {
        if (!next[c.id]) next[c.id] = { year: '', semester: '', status: 'idle' }
      }
      return next
    })
  }, [unclassified])

  const setRow = (id: string, patch: Partial<DraftRow>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }
  const bulkApplyYear = (year: YearOfStudy | '') => {
    setDrafts(prev => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (next[id].status === 'done') continue
        next[id] = { ...next[id], year }
      }
      return next
    })
  }
  const bulkApplySemester = (semester: HebSemester | '') => {
    setDrafts(prev => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (next[id].status === 'done') continue
        next[id] = { ...next[id], semester }
      }
      return next
    })
  }

  // Each row is "ready to save" if at least one of year/semester is picked.
  // Partial classification is allowed — the path helper handles it
  // (תואר ראשון/ללא שנה/סמסטר א׳/X is still better than לא מסווגים/X).
  const readyToSaveIds = useMemo(
    () =>
      Object.entries(drafts)
        .filter(([, row]) => row.status !== 'done' && (row.year !== '' || row.semester !== ''))
        .map(([id]) => id),
    [drafts],
  )

  const doneCount = Object.values(drafts).filter(r => r.status === 'done').length
  const errorCount = Object.values(drafts).filter(r => r.status === 'error').length
  const [busy, setBusy] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)

  const saveAll = useCallback(async () => {
    if (busy || readyToSaveIds.length === 0) return
    setBusy(true)
    setBatchProgress({ current: 0, total: readyToSaveIds.length })

    // Sequential — Drive's API gets cranky under concurrent folder mutations
    // on the same parent. The 29-course case takes ~30s sequentially, which
    // we surface with a live progress bar.
    for (let i = 0; i < readyToSaveIds.length; i++) {
      const id = readyToSaveIds[i]
      const row = drafts[id]
      if (!row) continue
      setRow(id, { status: 'saving', error: undefined })
      try {
        await reclassifyCourse(id, {
          year_of_study: row.year || undefined,
          semester: row.semester || undefined,
        })
        setRow(id, { status: 'done' })
      } catch (e: any) {
        setRow(id, { status: 'error', error: e?.message || 'שגיאה לא ידועה' })
      }
      setBatchProgress({ current: i + 1, total: readyToSaveIds.length })
    }

    setBusy(false)
  }, [busy, readyToSaveIds, drafts, reclassifyCourse])

  // Drive deep-link to the TEEPO root folder — handle.folderId is populated
  // by the DBProvider on first load.
  const driveUrl = handle?.folderId
    ? `https://drive.google.com/drive/folders/${handle.folderId}`
    : 'https://drive.google.com/drive/my-drive'

  // ── Render states ────────────────────────────────────────────────────────

  if (!ready || loading) {
    return (
      <div className="cream-page classify-page">
        <main className="classify-main">
          <div className="classify-loading">
            <Loader2 className="spin" size={28} />
            <p>טוען קורסים...</p>
          </div>
        </main>
      </div>
    )
  }

  if (unclassified.length === 0) {
    return (
      <div className="cream-page classify-page">
        <main className="classify-main">
          <header className="classify-head">
            <h1>סיווג קורסים</h1>
          </header>
          <div className="classify-empty">
            <CheckCircle2 className="empty-ico" size={48} />
            <h2>הכל מסווג</h2>
            <p>אין קורסים שמחכים לסיווג. כל הקורסים שלך כבר ממוקמים בתיקיות המתאימות ב-Drive.</p>
            <div className="empty-actions">
              <Link href="/summaries" className="btn-secondary">חזרה ל"המוח"</Link>
              <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
                פתח את TEEPO ב-Drive <ExternalLink size={15} />
              </a>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Success screen — all rows saved, nothing left to do
  const allDone = doneCount === unclassified.length && doneCount > 0
  if (allDone) {
    return (
      <div className="cream-page classify-page">
        <main className="classify-main">
          <header className="classify-head">
            <h1>סיווג קורסים</h1>
          </header>
          <div className="classify-success">
            <CheckCircle2 className="success-ico" size={56} />
            <h2>סיימנו! סווגו {doneCount} קורסים.</h2>
            <p>התיקיות מסודרות ב-Drive תחת <code>TEEPO/תואר ראשון/שנה X׳/סמסטר Y׳/</code>.</p>
            <div className="success-actions">
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary btn-lg"
              >
                פתח את TEEPO ב-Drive <ExternalLink size={18} />
              </a>
              <button type="button" onClick={() => router.push('/summaries')} className="btn-secondary">
                חזרה ל"המוח" <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="cream-page classify-page">
      <main className="classify-main">

        <header className="classify-head">
          <div className="classify-eyebrow"><Sparkles size={14} /> סיווג מהיר</div>
          <h1>סיווג {unclassified.length} קורסים</h1>
          <p className="classify-sub">
            בחר שנה וסמסטר לכל קורס. אחרי השמירה, התיקיות יועברו ב-Drive ל-
            <code>TEEPO/תואר ראשון/&lt;שנה&gt;/&lt;סמסטר&gt;/</code>.
          </p>
        </header>

        {/* Bulk-apply controls — most users have all 29 in the same semester */}
        <section className="classify-bulk">
          <div className="bulk-label">החל על כולם:</div>
          <div className="bulk-row">
            <div className="bulk-field">
              <label htmlFor="bulk-year">שנה</label>
              <select
                id="bulk-year"
                onChange={(e) => bulkApplyYear(e.target.value === '' ? '' : (parseInt(e.target.value, 10) as YearOfStudy))}
                disabled={busy}
                defaultValue=""
              >
                <option value="">—</option>
                {YEAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="bulk-field">
              <label htmlFor="bulk-sem">סמסטר</label>
              <select
                id="bulk-sem"
                onChange={(e) => bulkApplySemester(e.target.value as HebSemester | '')}
                disabled={busy}
                defaultValue=""
              >
                <option value="">—</option>
                {SEMESTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <p className="bulk-hint">
            ייבחר אותו ערך עבור כל הקורסים שעדיין לא נשמרו. אפשר לאחר מכן לערוך קורסים בודדים בטבלה.
          </p>
        </section>

        {/* Per-course table */}
        <section className="classify-table-wrap">
          <table className="classify-table">
            <thead>
              <tr>
                <th>שם הקורס</th>
                <th style={{ width: 140 }}>שנה</th>
                <th style={{ width: 140 }}>סמסטר</th>
                <th style={{ width: 40 }} aria-label="סטטוס"></th>
              </tr>
            </thead>
            <tbody>
              {unclassified.map((c) => {
                const row = drafts[c.id] ?? { year: '', semester: '', status: 'idle' as const }
                return (
                  <tr key={c.id} className={`status-${row.status}`}>
                    <td className="cell-title">
                      <div className="row-title">{c.title}</div>
                      {row.status === 'error' && row.error && (
                        <div className="row-error">{row.error}</div>
                      )}
                    </td>
                    <td>
                      <select
                        value={row.year}
                        onChange={(e) =>
                          setRow(c.id, { year: e.target.value === '' ? '' : (parseInt(e.target.value, 10) as YearOfStudy) })
                        }
                        disabled={busy || row.status === 'done'}
                      >
                        <option value="">—</option>
                        {YEAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.semester}
                        onChange={(e) => setRow(c.id, { semester: e.target.value as HebSemester | '' })}
                        disabled={busy || row.status === 'done'}
                      >
                        <option value="">—</option>
                        {SEMESTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="cell-status" aria-live="polite">
                      {row.status === 'saving' && <Loader2 className="spin" size={16} aria-label="שומר" />}
                      {row.status === 'done' && <CheckCircle2 className="ok" size={18} aria-label="נשמר" />}
                      {row.status === 'error' && <AlertCircle className="err" size={18} aria-label="שגיאה" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {/* Footer — save bar */}
        <footer className="classify-foot">
          <div className="foot-status">
            {batchProgress
              ? `שומר ${batchProgress.current} מתוך ${batchProgress.total}…`
              : `${readyToSaveIds.length} קורסים מוכנים לשמירה`}
            {errorCount > 0 && <span className="err-count"> · {errorCount} שגיאות</span>}
            {doneCount > 0 && !busy && <span className="done-count"> · {doneCount} נשמרו</span>}
          </div>
          <div className="foot-actions">
            <Link href="/summaries" className="btn-secondary" aria-disabled={busy}>
              ביטול
            </Link>
            <button
              type="button"
              onClick={saveAll}
              disabled={busy || readyToSaveIds.length === 0}
              className="btn-primary"
            >
              {busy ? <><Loader2 className="spin" size={15} /> שומר…</> : `שמור הכל (${readyToSaveIds.length})`}
            </button>
          </div>
        </footer>

      </main>
    </div>
  )
}
