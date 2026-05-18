'use client'

/**
 * Course page — the notebook is the main surface.
 *
 * Lessons are chapters inside the course notebook; AI is ambient (silent
 * until opened); Moodle data sits at the bottom as a reference shelf. A
 * recorder card above missions lets the user pipe a class recording or
 * Zoom export through Whisper + Claude and insert the summary into the
 * right chapter.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header (course title, semester, year)                         │
 *   ├────────┬──────────────────────────────────┬──────────────────┤
 *   │ TOC    │   Focused chapter (paper)        │  AI panel        │
 *   │ L1 ●   │   [ editor ]                     │  (silent default)│
 *   │ L2 ←   │   [ mark done ] [ coach review ] │                  │
 *   └────────┴──────────────────────────────────┴──────────────────┘
 *   │ Lesson recorder (audio/Zoom → Whisper → summary)              │
 *   │ Missions (synced: shown here + in /tasks)                     │
 *   │ Course Knowledge (from Moodle)                                │
 *   └───────────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, CheckCircle2, Circle, BookOpen, Sparkles, MessageSquare,
  ChevronLeft, ChevronRight, X, FileText,
  User, ExternalLink, Plus, Link as LinkIcon, Mail, Users,
} from 'lucide-react'
import { useDB, useCourse, useLessons } from '@/lib/db-context'
import NotebookPaper, { type NotebookPrefs } from '@/components/course/NotebookPaper'
import LessonNotebookChat from '@/components/course/LessonNotebookChat'
import LessonRecorder from '@/components/course/LessonRecorder'
import { TasksMini, AssignmentsMini } from '@/components/course/CourseTabs'
import { FolderSection } from '@/components/summaries/CourseDrivePanel'
import {
  runNotebookAi,
  promptContinue, promptSummarize, promptExpand, promptFix, promptToList,
  promptImprove, promptShorten, promptExplain,
} from '@/lib/notebook-ai-client'
import type { AiActionsAPI, EditorStats } from '@/components/RichTextEditor'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

const DEFAULT_PREFS: NotebookPrefs = {
  paper: 'cream',
  fontFamily: 'serif',
  textSize: 'md',
  lineGap: 'normal',
  showLines: true,
}

export default function CoursePage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const { ready, updateLesson, createLesson: dbCreateLesson } = useDB()
  const course = useCourse(courseId)
  const lessons = useLessons(courseId)

  // ── Chapter selection ────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeLesson = useMemo(
    () => lessons.find(l => l.id === activeId) || lessons[0] || null,
    [lessons, activeId],
  )
  useEffect(() => {
    if (!activeId && lessons.length > 0) setActiveId(lessons[0].id)
  }, [lessons, activeId])

  // ── Notebook prefs (remembered per device) ───────────────
  const [prefs, setPrefs] = useState<NotebookPrefs>(DEFAULT_PREFS)
  useEffect(() => {
    try {
      const s = localStorage.getItem('teepo.notebook.prefs')
      if (s) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(s) })
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('teepo.notebook.prefs', JSON.stringify(prefs)) } catch {}
  }, [prefs])

  // ── AI panel state: silent by default, user opens when needed ────
  const [aiOpen, setAiOpen] = useState(false)

  // Earlier versions had two AI stubs here — an idle "whisper" and an
  // end-of-chapter "coach" button — both rendered placeholder Hebrew
  // strings instead of calling the AI. Removed because they showed up
  // every visit and eroded trust. The real per-chapter AI surface lives
  // in <LessonNotebookChat /> + the in-editor `/` slash menu.

  // Lightweight transient notice — replaces the old `coachMsg` slot for
  // legitimate use cases like "summary inserted" or "create-lesson
  // failed". Auto-dismisses after 4s; not AI-related.
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(id)
  }, [notice])


  // ── Save state + editor stats (shown in the NotebookPaper footer) ──
  const [saveState, setSaveState] = useState<'saving' | 'saved' | null>(null)
  const [stats, setStats] = useState<EditorStats>({ words: 0, chars: 0 })
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Save editor content ──────────────────────────────────
  const handleEdit = (html: string) => {
    if (!activeLesson) return
    updateLesson(activeLesson.id, { content: html })
    setSaveState('saving')
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => {
      setSaveState('saved')
      // Hide "saved" after a moment so the footer returns to empty.
      savedTimer.current = setTimeout(() => setSaveState(null), 1600)
    }, 400)
  }
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  // ── Insert AI summary from a lesson recording into the notebook body.
  //    Parses the summary (which may be plain text, numbered sections, or
  //    bullet lines) into lightweight HTML and appends it to the target
  //    lesson's existing content. The editor auto-syncs via its content
  //    prop effect, so the user sees the insertion immediately.
  const handleInsertSummary = (targetLessonId: string, summary: string) => {
    const target = lessons.find(l => l.id === targetLessonId)
    if (!target) return
    const dateLabel = new Date().toLocaleDateString('he-IL', {
      day: 'numeric', month: 'numeric', year: 'numeric',
    })
    const block = summaryToHtml(summary, dateLabel)
    const existing = target.content || ''
    const separator = existing.trim() ? '<p></p>' : ''
    updateLesson(targetLessonId, { content: existing + separator + block })
    // If the user was looking at a different chapter, jump to the one we
    // just updated so they see the inserted summary.
    if (activeLesson?.id !== targetLessonId) setActiveId(targetLessonId)
    setNotice(`הסיכום של ההקלטה נוסף לפרק "${target.title}".`)
  }

  // ── AI actions — wire the inline editor affordances to the notebook
  //    backend. Each handler returns { ok, text } or { ok:false, error }.
  const aiActions: AiActionsAPI = useMemo(() => {
    const run = (prompt: string, context: string) =>
      runNotebookAi({ prompt, context, courseId })
    return {
      continue:  (ctx) => run(promptContinue(), ctx),
      summarize: (ctx) => run(promptSummarize(), ctx),
      expand:    (para, ctx) => run(promptExpand(para), ctx),
      fix:       (para, ctx) => run(promptFix(para), ctx),
      toList:    (para, ctx) => run(promptToList(para), ctx),
      improve:   (sel, ctx)  => run(promptImprove(sel), ctx),
      shorten:   (sel, ctx)  => run(promptShorten(sel), ctx),
      explain:   (sel, ctx)  => run(promptExplain(sel), ctx),
    }
  }, [courseId])

  const toggleDone = () => {
    if (!activeLesson) return
    updateLesson(activeLesson.id, { is_completed: !activeLesson.is_completed })
  }

  // ── Chapter navigation ───────────────────────────────────
  const jumpBy = (delta: number) => {
    if (!activeLesson) return
    const idx = lessons.findIndex(l => l.id === activeLesson.id)
    const next = lessons[idx + delta]
    if (next) setActiveId(next.id)
  }

  // ── Add first chapter (shown when lesson list is empty) ──
  const [creating, setCreating] = useState(false)
  const addFirstChapter = async () => {
    if (creating) return
    setCreating(true)
    try {
      const created = await dbCreateLesson(courseId, { title: 'פרק 1' })
      setActiveId(created.id)
    } catch {
      setNotice('שגיאה ביצירת פרק. נסה שוב.')
    } finally {
      setCreating(false)
    }
  }

  if (!ready) {
    return <div className="p-10 text-center text-ink-muted">טוען...</div>
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

  const completedCount = lessons.filter(l => l.is_completed).length

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto" style={{ direction: 'rtl' }}>
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
            <span>· {completedCount} מתוך {lessons.length} פרקים הושלמו</span>
          </div>
        </div>
      </div>

      {/* ── Notebook (TOC + focused chapter + AI) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_auto] gap-4 mb-6">
        {/* TOC */}
        <aside className="glass rounded-2xl p-3 h-fit lg:sticky lg:top-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted px-2 pb-2 flex items-center gap-1.5">
            <BookOpen size={12} /> פרקים
          </div>
          {lessons.length === 0 ? (
            <div className="px-2 py-3 space-y-2">
              <div className="text-xs text-ink-muted">
                אין עדיין פרקים בקורס הזה.
              </div>
              <button
                onClick={addFirstChapter}
                disabled={creating}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-400/20 hover:bg-indigo-500/25 disabled:opacity-50"
              >
                <Plus size={12} /> צור פרק ראשון
              </button>
            </div>
          ) : (
            <>
              <ul className="space-y-0.5">
                {lessons.map((l, i) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setActiveId(l.id)}
                      className={`w-full text-right flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        activeLesson?.id === l.id
                          ? 'bg-indigo-500/15 text-ink border border-indigo-400/20'
                          : 'text-ink-muted hover:text-ink hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {l.is_completed
                        ? <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                        : <Circle size={12} className="text-ink-muted/60 flex-shrink-0" />}
                      <span className="flex-1 truncate">{i + 1}. {l.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={addFirstChapter}
                disabled={creating}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-ink-muted hover:text-ink hover:bg-white/5 border border-dashed border-white/10 disabled:opacity-50"
              >
                <Plus size={11} /> פרק חדש
              </button>
            </>
          )}
        </aside>

        {/* Focused chapter */}
        <div className="relative">
          {activeLesson ? (
            <NotebookPaper
              {...prefs}
              onChange={(patch) => setPrefs(p => ({ ...p, ...patch }))}
              title={`פרק ${lessons.findIndex(l => l.id === activeLesson.id) + 1} · ${activeLesson.title}`}
              stats={stats}
              saveState={saveState}
              headerRight={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => jumpBy(-1)}
                    disabled={lessons.findIndex(l => l.id === activeLesson.id) === 0}
                    className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-white/10 disabled:opacity-30"
                    title="פרק קודם"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() => jumpBy(1)}
                    disabled={lessons.findIndex(l => l.id === activeLesson.id) === lessons.length - 1}
                    className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-white/10 disabled:opacity-30"
                    title="פרק הבא"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
              }
            >
              <RichTextEditor
                content={activeLesson.content || ''}
                onChange={handleEdit}
                placeholder="כתוב את הסיכום שלך כאן. ה-AI שקט אלא אם תבקש ממנו משהו. הקלד / לפעולות AI."
                aiActions={aiActions}
                onStats={setStats}
              />
            </NotebookPaper>
          ) : (
            <div className="glass rounded-2xl p-10 text-center text-ink-muted space-y-3">
              <div>אין עדיין פרקים בקורס. צור פרק ראשון כדי להתחיל לכתוב.</div>
              <button
                onClick={addFirstChapter}
                disabled={creating}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 hover:bg-indigo-500/30 disabled:opacity-50"
              >
                <Plus size={14} /> צור פרק ראשון
              </button>
            </div>
          )}

          {/* Transient notice (insert-summary success, create-lesson error, etc.) */}
          <AnimatePresence>
            {notice && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mt-3 glass rounded-xl p-3 text-xs flex items-start gap-2 border border-emerald-500/20"
              >
                <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">{notice}</div>
                <button onClick={() => setNotice(null)} className="text-ink-muted hover:text-ink">
                  <X size={13} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chapter actions strip — just the "mark done" toggle now that
              the coach stub is gone. Real AI lives in the side chat
              panel + the in-editor `/` slash menu. */}
          {activeLesson && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={toggleDone}
                className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                  activeLesson.is_completed
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                    : 'bg-white/5 text-ink-muted hover:text-ink border border-white/8'
                }`}
              >
                {activeLesson.is_completed ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                {activeLesson.is_completed ? 'פרק הושלם' : 'סמן פרק כהושלם'}
              </button>
            </div>
          )}
        </div>

        {/* AI panel (silent until opened) */}
        <aside className={`flex flex-col transition-all ${aiOpen ? 'w-full lg:w-[360px]' : 'w-full lg:w-12'}`}>
          {aiOpen ? (
            <div className="glass rounded-2xl overflow-hidden h-[640px] flex flex-col relative">
              <button
                onClick={() => setAiOpen(false)}
                className="absolute top-2 left-2 z-10 p-1 rounded text-ink-muted hover:text-ink hover:bg-white/10"
                title="כווץ"
              >
                <X size={13} />
              </button>
              {activeLesson && (
                <LessonNotebookChat
                  lesson={activeLesson}
                  courseId={courseId}
                  courseTitle={course.title}
                />
              )}
            </div>
          ) : (
            <button
              onClick={() => setAiOpen(true)}
              className="glass rounded-2xl p-3 hover:bg-white/5 transition-colors flex lg:flex-col items-center justify-center gap-2 text-ink-muted hover:text-ink group h-full min-h-[120px]"
              title="פתח פנל AI"
            >
              <MessageSquare size={16} className="group-hover:text-violet-400 transition-colors" />
              <span className="text-[10px] lg:[writing-mode:vertical-rl] lg:rotate-180 tracking-wider">
                שאל את TEEPO
              </span>
            </button>
          )}
        </aside>
      </div>

      {/* ── Lesson recorder (audio/Zoom → Whisper → Claude summary) ── */}
      {lessons.length > 0 && (
        <div className="mb-6">
          <LessonRecorder
            lessons={lessons.map(l => ({ id: l.id, title: l.title }))}
            defaultLessonId={activeLesson?.id || lessons[0]?.id}
            onInsertSummary={handleInsertSummary}
          />
        </div>
      )}

      {/* ── Missions (synced view) ─────────────────────── */}
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

      {/* ── Course Knowledge (Moodle layer) ────────────── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen size={14} className="text-indigo-400" />
            על הקורס
          </h2>
          <span className="text-[10px] text-ink-muted">
            {course.source === 'bgu' ? 'נשאב מ-Moodle' : 'הזנה ידנית'}
          </span>
        </div>

        {/* Compact metadata banner — description + Moodle date range +
            category. Only renders when there's at least one populated
            field so brand-new manual courses don't get an empty box. */}
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

        {/* Drive folder shelf — live listing of the course's שיעורים,
            מטלות, סיכומים folders. Replaces the old fake-data stub list.
            Falls back to a "create folders on /summaries" hint when the
            course hasn't been provisioned in Drive yet. */}
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

        <div className="mt-4 text-[11px] text-ink-muted border-t border-white/5 pt-3">
          הנתונים למעלה נקראים מ-Moodle כשמריצים סנכרון, ומשמשים גם כמקורות
          של עוזר ה-AI של הקורס (במקום פיצ׳ר /notebooks נפרד).
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

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

// ── summaryToHtml ────────────────────────────────────────────
// Claude's summary comes back as Hebrew plain text that mixes numbered
// section headers ("1. נקודות עיקריות"), bullet lines ("- foo") and plain
// paragraphs. Convert that into lightweight HTML the TipTap editor will
// round-trip cleanly, so inserting it "just looks right" in the notebook.
function summaryToHtml(text: string, dateLabel: string): string {
  const esc = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const lines = (text || '').split('\n')
  let html = `<h3>🎤 סיכום הקלטת השיעור · ${esc(dateLabel)}</h3>`
  let inList = false
  const closeList = () => { if (inList) { html += '</ul>'; inList = false } }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { closeList(); continue }
    const bulletMatch = line.match(/^[-•·*]\s+(.*)$/)
    const numberedMatch = line.match(/^\d+[.)]\s+(.*)$/)
    if (bulletMatch) {
      if (!inList) { html += '<ul>'; inList = true }
      html += `<li>${esc(bulletMatch[1])}</li>`
    } else if (numberedMatch) {
      closeList()
      html += `<p><strong>${esc(numberedMatch[1])}</strong></p>`
    } else {
      closeList()
      html += `<p>${esc(line)}</p>`
    }
  }
  closeList()
  return html
}

/**
 * Drive folder shelf — surfaces the course's שיעורים / מטלות / סיכומים
 * directly on the course page. Replaces the fake hardcoded "קבצים
 * רשמיים" list with a live FolderSection per folder (same component
 * used on /summaries — upload, refresh, delete already work).
 *
 * When the course has no drive_folder_ids yet (never been provisioned),
 * we show a one-line hint pointing the user to /summaries where the
 * "צור תיקיות" flow lives.
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

/**
 * Lecturer + TAs panel for the course detail page (task #16).
 *
 * Renders the lecturer's email (mailto link) and a list of teaching
 * assistants with their email + role + office hours when present. Falls
 * back to a friendly "אין עדיין פרטים" message when nothing is set.
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
