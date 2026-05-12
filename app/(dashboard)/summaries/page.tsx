'use client'

/**
 * /summaries (המוח) — degree tree → semester → courses → folder shortcuts.
 *
 * Source: teepo-design/mockup_summaries.html.
 *
 * Simplified vs mockup: the mockup renders two parallel degrees (BGU תואר
 * ראשון + מ"א). Most TEEPO users carry one active degree at a time, so we
 * render a single-degree tree and let the second column appear only when
 * we discover courses tagged for a separate degree (future work).
 *
 * Path: root "TEEPO" node → degree node → semester chips → course panel.
 * Selecting a semester reveals its courses below; each course card has
 * folder shortcuts into the user's Drive hierarchy
 * (lessons / summaries / files / notes per spec §3.3).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Folder, BookOpen, FileText, StickyNote, Mic, GraduationCap, Brain, ChevronDown } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { useUniversityName } from '@/lib/use-university'
import CourseDrivePanel from '@/components/summaries/CourseDrivePanel'
import type { Course } from '@/types'

interface SemesterBucket {
  key: string                 // e.g. "2025-A"
  label: string               // e.g. "שנה א' · סמסטר א'"
  year: number
  semester: 'A' | 'B' | 'C'
  courses: Course[]
}

/** Group the user's courses into semester buckets, sorted chronologically. */
function bucketize(courses: Course[]): SemesterBucket[] {
  const map = new Map<string, SemesterBucket>()
  for (const c of courses) {
    const year = (c as any).academic_year ?? (c as any).year ?? new Date().getFullYear()
    const sem = ((c as any).semester ?? 'A') as 'A' | 'B' | 'C'
    const key = `${year}-${sem}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: `${year} · ${sem === 'A' ? 'סמסטר א\'' : sem === 'B' ? 'סמסטר ב\'' : 'סמסטר קיץ'}`,
        year,
        semester: sem,
        courses: [],
      })
    }
    map.get(key)!.courses.push(c)
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year     // newest year first
    return a.semester.localeCompare(b.semester)         // A → B → C inside a year
  })
}

const COURSE_PALETTE = [
  { color: '#8b5cf6', soft: '#ede9fe' },
  { color: '#d97706', soft: '#fef3c7' },
  { color: '#0d9488', soft: '#ccfbf1' },
  { color: '#6366f1', soft: '#e0e7ff' },
  { color: '#e11d48', soft: '#fce7f3' },
  { color: '#16a34a', soft: '#dcfce7' },
]

export default function SummariesPage() {
  const { db } = useDB()
  const universityName = useUniversityName()

  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const buckets = useMemo(() => bucketize(courses), [courses])
  const [activeSem, setActiveSem] = useState<string | null>(buckets[0]?.key ?? null)
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null)

  // If the active semester disappears (courses re-bucketed), fall back to first.
  const safeActive = buckets.find(b => b.key === activeSem) ?? buckets[0] ?? null
  const activeKey = safeActive?.key

  return (
    <div className="cream-page summaries-page">
      <main className="sum-main">

        <header className="sum-head">
          <div className="sum-eyebrow">המוח</div>
          <h1 className="sum-h1">
            הסיכומים <span className="accent">שלי</span>.
          </h1>
          <p className="sum-sub">
            כל החומר מסודר לפי תואר, סמסטר וקורס — נשמר ב-Google Drive האישי שלך.
          </p>
        </header>

        {/* ===== Tree ===== */}
        <div className="tree-wrap">
          {/* Root node — TEEPO. */}
          <div className="tree-root">
            <div className="node root">
              <Folder className="folder-ico" />
              <span className="name">TEEPO</span>
              <span className="count">{courses.length}</span>
            </div>
          </div>

          {/* Single degree column (multi-degree expansion is future work). */}
          <div className="degree-header">
            <div className="degree-to-sems" />
            <div className="node degree">
              <GraduationCap className="folder-ico" />
              <span className="name">{universityName || 'התואר שלי'}</span>
              <span className="count">{buckets.length} סמסטרים</span>
            </div>
          </div>

          {buckets.length > 0 && (
            <div className="sem-grid">
              {buckets.map(b => (
                <div className={`sem-chip-wrap ${b.key === activeKey ? 'active' : ''}`} key={b.key}>
                  <button
                    type="button"
                    className={`node sem ${b.key === activeKey ? 'active' : ''}`}
                    onClick={() => setActiveSem(b.key)}
                  >
                    <Folder className="folder-ico" />
                    <span className="name">{b.label}</span>
                    <span className="count">{b.courses.length}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Course panel for the active semester ===== */}
        {safeActive && (
          <>
            <div className="connector-line" />
            <section className="course-panel">
              <div className="course-panel-head">
                <div className="course-panel-icon"><Brain /></div>
                <div className="meta">
                  <div className="crumb">{universityName || 'התואר שלי'} · {safeActive.label}</div>
                  <h2>הקורסים של הסמסטר</h2>
                </div>
                <span className="count-pill">{safeActive.courses.length} קורסים</span>
              </div>

              {safeActive.courses.length === 0 ? (
                <div className="empty-state">
                  <Folder />
                  <h3>אין עוד קורסים בסמסטר הזה</h3>
                  <p>חברו את ה-Moodle או הוסיפו קורס ידנית כדי שהמוח שלכם יתמלא.</p>
                </div>
              ) : (
                <div className="course-grid">
                  {safeActive.courses.map((c, i) => {
                    const palette = COURSE_PALETTE[i % COURSE_PALETTE.length]
                    const expanded = expandedCourse === c.id
                    const folderIds = (c as any).drive_folder_ids ?? null
                    return (
                      <div
                        key={c.id}
                        className={`course-card ${expanded ? 'expanded' : ''}`}
                        style={{ ['--course-color' as any]: palette.color, ['--course-soft' as any]: palette.soft }}
                      >
                        <button
                          type="button"
                          className="course-card-trigger"
                          onClick={() => setExpandedCourse(expanded ? null : c.id)}
                          aria-expanded={expanded}
                          aria-controls={`course-panel-${c.id}`}
                        >
                          <div className="top">
                            <div className="ico-wrap"><BookOpen /></div>
                            <div>
                              <h3>{c.title}</h3>
                              <small>{(c as any).shortname ?? (c as any).code ?? ''}</small>
                            </div>
                            <ChevronDown
                              className="course-card-chevron"
                              size={18}
                              style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
                            />
                          </div>
                          <div className="folders">
                            <span className="folder-row">
                              <Mic />
                              <span className="label">שיעורים</span>
                            </span>
                            <span className="folder-row">
                              <Folder />
                              <span className="label">מטלות</span>
                            </span>
                            <span className="folder-row">
                              <StickyNote />
                              <span className="label">סיכומים</span>
                            </span>
                            <Link
                              href={`/courses/${c.id}`}
                              className="folder-row link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileText />
                              <span className="label">פתח קורס →</span>
                            </Link>
                          </div>
                        </button>
                        {expanded && (
                          <div id={`course-panel-${c.id}`} className="course-card-panel">
                            <CourseDrivePanel folderIds={folderIds} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

      </main>
    </div>
  )
}
