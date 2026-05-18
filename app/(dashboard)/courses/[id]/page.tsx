'use client'

/**
 * Course page — simplified surface focused on shelf + actions.
 *
 * Earlier iterations were a chapter-based notebook editor with an AI
 * side chat ("שאל את TEEPO"), a lesson recorder, and a chapter TOC.
 * That whole notebook stack moved out per user feedback — too much
 * surface for a page whose real job is to point you at the course's
 * Drive folders + Moodle metadata + tasks.
 *
 * What stays:
 *   - Header: title + shortname + dates + per-course "סנכרן מ-Moodle"
 *   - "על הקורס": metadata banner, action toolbar, Drive folder shelf
 *     (שיעורים / מטלות / סיכומים), Moodle cards (סילבוס / מרצה / לינקים)
 *   - "משימות ומטלות": TasksMini + AssignmentsMini cards
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, CheckCircle2, BookOpen, X, FileText,
  User, ExternalLink, Link as LinkIcon, Mail, Users,
  RefreshCw, Loader2, ListTree,
} from 'lucide-react'
import { useDB, useCourse } from '@/lib/db-context'
import { FolderSection } from '@/components/summaries/CourseDrivePanel'
import { useDriveFiles } from '@/lib/use-drive-files'
import { useAuth } from '@/lib/auth-context'
import { TasksMini, AssignmentsMini } from '@/components/course/CourseTabs'
import { groupFilesByLesson } from '@/lib/lesson-grouping'
import { ensureSubfolder } from '@/lib/drive-folders'
import { moveFile } from '@/lib/drive-files'
import { supabase } from '@/lib/supabase'

export default function CoursePage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const { ready, updateCourse, flushSave } = useDB() as any
  const course = useCourse(courseId)

  // Transient notice slot for action results (sync/organize toasts).
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(id)
  }, [notice])

  // Per-course Moodle resync — pulls the global course list from the
  // backend (same endpoint /moodle's "סנכרן הכל" uses) and merges only
  // THIS course's fresh metadata into the local DB.
  const [syncing, setSyncing] = useState(false)
  const syncFromMoodle = async () => {
    if (!course || syncing) return
    setSyncing(true)
    try {
      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}
      const res = await fetch(`${BACKEND}/api/university/courses`, {
        headers,
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`Backend ${res.status}`)
      const data = await res.json()
      if (data.status === 'error') throw new Error(data.message || 'הסנכרון נכשל')
      const scraped: any[] = data.courses || []
      const match = scraped.find((c: any) =>
        (course.source_url && c.url === course.source_url) ||
        c.title === course.title
      )
      if (!match) {
        setNotice('הקורס לא נמצא בסנכרון. אולי הוא הוסר מ-Moodle?')
        return
      }
      await updateCourse(course.id, {
        source: 'bgu',
        source_url: match.url || course.source_url,
        shortname: match.shortname,
        moodle_startdate: match.startdate || undefined,
        moodle_enddate: match.enddate || undefined,
        category_name: match.category_name,
        ...(match.lecturer_email !== undefined ? { lecturer_email: match.lecturer_email ?? undefined } : {}),
        ...(match.syllabus_url !== undefined ? { syllabus_url: match.syllabus_url ?? undefined } : {}),
        ...(match.teaching_assistants !== undefined ? { teaching_assistants: match.teaching_assistants } : {}),
        ...(match.course_links !== undefined ? { course_links: match.course_links } : {}),
        ...(match.portal_metadata !== undefined ? { portal_metadata: match.portal_metadata } : {}),
      })
      if (typeof flushSave === 'function') {
        try { await flushSave() } catch {}
      }
      setNotice('הקורס סונכרן בהצלחה מ-Moodle ✓')
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        setNotice('השרת לא הגיב — נסה שוב בעוד דקה')
      } else {
        console.warn('[course-sync]', e)
        setNotice('שגיאה בסנכרון: ' + (e?.message || 'נסה שוב'))
      }
    } finally {
      setSyncing(false)
    }
  }

  if (!ready) {
    return <div className="p-10 text-center text-ink-muted">טוען קורס...</div>
  }
  if (!course) {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-muted mb-3">הקורס לא נמצא.</p>
        <button onClick={() => router.push('/courses')} className="text-indigo-400 hover:underline">
          חזרה לרשימת הקורסים
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto" style={{ direction: 'rtl' }}>
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push('/courses')}
          className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5"
          title="חזרה לרשימת הקורסים"
        >
          <ArrowRight size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">{course.title}</h1>
          <div className="text-xs text-ink-muted mt-0.5 flex items-center gap-2 flex-wrap">
            {course.shortname && (
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/8" dir="ltr">
                {course.shortname}
              </span>
            )}
            {course.academic_year && <span>שנת {course.academic_year}</span>}
            {course.semester && <span>· סמסטר {course.semester}</span>}
          </div>
        </div>

        {course.source === 'bgu' && (
          <button
            onClick={syncFromMoodle}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-400/20 hover:bg-indigo-500/25 disabled:opacity-50 flex-shrink-0"
            title="משוך נתונים מעודכנים על הקורס מ-Moodle"
          >
            {syncing
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />}
            {syncing ? 'מסנכרן…' : 'סנכרן מ-Moodle'}
          </button>
        )}
      </div>

      {/* Transient notice (sync success/error, organize result) */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 glass rounded-xl p-3 text-xs flex items-start gap-2 border border-emerald-500/20"
          >
            <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">{notice}</div>
            <button onClick={() => setNotice(null)} className="text-ink-muted hover:text-ink">
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── על הקורס: metadata + Drive shelf + Moodle cards ─── */}
      <div className="glass rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen size={14} className="text-indigo-400" />
            על הקורס
          </h2>
          <span className="text-[10px] text-ink-muted">
            {course.source === 'bgu' ? 'נשאב מ-Moodle' : 'הזנה ידנית'}
          </span>
        </div>

        {/* Metadata banner — only renders when at least one Moodle field
            populated, so manual courses don't get an empty box. */}
        {(course.description || course.moodle_startdate || course.moodle_enddate || course.category_name) && (
          <div className="mb-4 rounded-xl bg-white/[0.02] border border-white/8 p-4 space-y-2">
            {course.description && (
              <p className="text-xs text-ink-soft leading-relaxed">{course.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
              {course.category_name && (
                <span className="inline-flex items-center gap-1">
                  <BookOpen size={10} />
                  {course.category_name}
                </span>
              )}
              {(course.moodle_startdate || course.moodle_enddate) && (
                <span className="inline-flex items-center gap-1" dir="ltr">
                  {course.moodle_startdate && new Date(course.moodle_startdate * 1000).toLocaleDateString('he-IL')}
                  {course.moodle_startdate && course.moodle_enddate && ' – '}
                  {course.moodle_enddate && new Date(course.moodle_enddate * 1000).toLocaleDateString('he-IL')}
                </span>
              )}
              {course.source_url && (
                <a
                  href={course.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                >
                  <ExternalLink size={10} /> פתח ב-Moodle
                </a>
              )}
            </div>
          </div>
        )}

        {/* Action toolbar — organize שיעורים into per-week subfolders +
            re-sync from Moodle (duplicate of the header button for
            discoverability in this section). */}
        {course.drive_folder_ids?.lessons && (
          <CourseLessonsActions
            lessonsFolderId={course.drive_folder_ids.lessons}
            onResult={setNotice}
          />
        )}

        {/* Drive folder shelf */}
        <CourseDriveShelf course={course} />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mt-4">
          <MoodleCard icon={FileText} title="סילבוס" hint="מסמך הקורס הרשמי">
            {course.syllabus_url ? (
              <a
                href={course.syllabus_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                dir="ltr"
              >
                <ExternalLink size={11} />
                <span className="truncate max-w-[180px]">פתח סילבוס</span>
              </a>
            ) : (
              <p className="text-xs text-ink-subtle">אין עדיין סילבוס.</p>
            )}
          </MoodleCard>

          <MoodleCard icon={User} title="פרטי מרצה" hint="יצירת קשר ומתרגלים">
            <LecturerInfo
              email={course.lecturer_email}
              tas={course.teaching_assistants}
            />
          </MoodleCard>

          <MoodleCard icon={LinkIcon} title="קישורים" hint="מקורות מהקורס">
            {course.course_links && course.course_links.length > 0 ? (
              <ul className="space-y-1.5">
                {course.course_links.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <ExternalLink size={10} className="flex-shrink-0" />
                      <span className="truncate">{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-subtle">אין קישורים.</p>
            )}
          </MoodleCard>
        </div>
      </div>

      {/* ── משימות ומטלות ───────────────────────────── */}
      <div className="glass rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-400" />
            משימות ומטלות
          </h2>
          <span className="text-[10px] text-ink-muted">
            מסתנכרן עם /tasks ועם כרטיס הקורס
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TasksMini courseId={courseId} />
          <AssignmentsMini courseId={courseId} />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

/**
 * Course-level action toolbar above the Drive folder shelf. Two actions:
 *
 *  - "ארגן לפי שיעור": scans the שיעורים folder, detects Week N pairs
 *    (uses lib/lesson-grouping), creates per-week sub-folders, moves
 *    matching files. Same logic as the per-folder OrganizeByLessonButton
 *    inside FolderSection — surfaced at the section header level so it's
 *    discoverable even when the user hasn't drilled into the folder.
 *
 *  - When 0 detectable groups → button shows "אין קבצים לארגן" disabled.
 */
function CourseLessonsActions({
  lessonsFolderId,
  onResult,
}: {
  lessonsFolderId: string
  onResult: (msg: string) => void
}) {
  const { files } = useDriveFiles(lessonsFolderId)
  const { googleToken, refreshGoogleToken } = useAuth()
  const [busy, setBusy] = useState(false)

  const { groups } = groupFilesByLesson(files)
  const totalFiles = groups.reduce((n, g) => n + g.files.length, 0)
  const canOrganize = groups.length > 0 && !busy

  const organize = async () => {
    if (!canOrganize) return
    setBusy(true)
    try {
      const tok = googleToken || (await refreshGoogleToken())
      if (!tok) {
        onResult('לא ניתן להתחבר ל-Drive')
        return
      }
      let failures = 0
      for (const g of groups) {
        try {
          const subId = await ensureSubfolder(tok, g.folderName, lessonsFolderId)
          for (const f of g.files) {
            try { await moveFile(tok, f.id, subId, lessonsFolderId) }
            catch { failures++ }
          }
        } catch { failures += g.files.length }
      }
      if (failures > 0) onResult(`סודרו עם ${failures} כשלים`)
      else onResult(`סודר! ${groups.length} תיקיות שיעורים נוצרו (${totalFiles} קבצים).`)
    } catch (e: any) {
      onResult('שגיאה בארגון: ' + (e?.message || 'נסה שוב'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={organize}
        disabled={!canOrganize}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-violet-500/15 text-violet-300 border border-violet-400/20 hover:bg-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
        title={
          groups.length === 0
            ? 'אין קבצי שיעור עם תאריכים מזוהים (Week N / שיעור N) — העלה קבצים תחילה'
            : `ארגן ${totalFiles} קבצים ב-${groups.length} תיקיות לפי שבוע`
        }
      >
        {busy
          ? <Loader2 size={13} className="animate-spin" />
          : <ListTree size={13} />}
        {busy ? 'מסדר…' : groups.length > 0 ? `ארגן לפי שיעור (${groups.length})` : 'ארגן לפי שיעור'}
      </button>
      <span className="text-[10px] text-ink-muted">
        קבצים בתיקיית שיעורים בעלי שם "Week N" / "שיעור N" יקובצו לתת-תיקיות.
      </span>
    </div>
  )
}

/**
 * Drive folder shelf — surfaces the course's שיעורים / מטלות / סיכומים
 * directly on the course page. Reuses FolderSection from /summaries so
 * upload, refresh, delete already work.
 */
function CourseDriveShelf({ course }: { course: import('@/types').Course }) {
  const ids = course.drive_folder_ids
  if (!ids?.course) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-center">
        <p className="text-xs text-ink-muted leading-relaxed mb-2">
          תיקיות הקורס עדיין לא נוצרו ב-Drive.
        </p>
        <a
          href="/summaries"
          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
        >
          לחץ ליצירת התיקיות בעמוד המוח <ArrowRight size={12} />
        </a>
      </div>
    )
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <FolderSection label="שיעורים"  hint="הרצאות, תרגולים, מצגות"     folderId={ids.lessons ?? null} />
      <FolderSection label="מטלות"    hint="תרגילים, פרויקטים, בחנים"   folderId={ids.assignments ?? null} />
      <FolderSection label="סיכומים" hint="הסיכומים האישיים שלך"         folderId={ids.notes ?? null} />
    </div>
  )
}

function MoodleCard({
  icon: Icon, title, hint, children,
}: {
  icon: any; title: string; hint: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
          <Icon size={13} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">{title}</div>
          <div className="text-[10px] text-ink-muted">{hint}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * Lecturer + TAs panel — mailto links + per-TA email/role/office hours.
 */
function LecturerInfo({
  email,
  tas,
}: {
  email?: string
  tas?: import('@/types').TeachingAssistant[]
}) {
  const hasLecturer = !!email
  const hasTAs = !!(tas && tas.length > 0)

  if (!hasLecturer && !hasTAs) {
    return <p className="text-xs text-ink-subtle">אין עדיין פרטים.</p>
  }

  return (
    <div className="text-xs space-y-2.5 text-ink-muted">
      {hasLecturer && (
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
          dir="ltr"
        >
          <Mail size={11} className="flex-shrink-0" />
          <span className="truncate">{email}</span>
        </a>
      )}
      {hasTAs && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle uppercase tracking-wide">
            <Users size={11} />
            <span>מתרגלים</span>
          </div>
          <ul className="space-y-1">
            {tas!.map((ta, i) => (
              <li key={i} className="space-y-0.5">
                <div className="text-ink leading-tight">
                  {ta.name}
                  {ta.role && (
                    <span className="text-ink-subtle text-[11px] mr-1">· {ta.role}</span>
                  )}
                </div>
                {ta.email && (
                  <a
                    href={`mailto:${ta.email}`}
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                    dir="ltr"
                  >
                    <Mail size={10} />
                    <span className="truncate max-w-[160px]">{ta.email}</span>
                  </a>
                )}
                {ta.office_hours && (
                  <div className="text-[11px] text-ink-subtle">{ta.office_hours}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
