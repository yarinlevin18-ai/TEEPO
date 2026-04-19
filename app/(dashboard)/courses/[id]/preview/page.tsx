'use client'

/**
 * Course Notebook — preview spike
 *
 * A single-page vision for what a course *feels* like when the notebook
 * is the main surface, lessons are chapters inside it, AI is ambient,
 * and Moodle sits at the bottom as a reference shelf.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header (course title, semester, year)                         │
 *   ├────────┬──────────────────────────────────┬──────────────────┤
 *   │        │                                  │                  │
 *   │ TOC    │   Focused chapter (paper)        │  AI panel        │
 *   │ ────   │                                  │  (silent default)│
 *   │ L1 ●   │   [ chapter title ]              │                  │
 *   │ L2     │   [ editor ]                     │  whispers appear │
 *   │ L3 ●   │                                  │  in margin       │
 *   │ L4 ←   │   [ mark done ] [ coach review ] │                  │
 *   │ L5     │                                  │                  │
 *   └────────┴──────────────────────────────────┴──────────────────┘
 *   │ Missions (synced: shown here + in header + in /tasks)         │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Course Knowledge (from Moodle)                                │
 *   │ [Files] [Syllabus + Dates] [Lecturer] [Announcements]         │
 *   └───────────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, CheckCircle2, Circle, BookOpen, Sparkles, MessageSquare,
  ChevronLeft, ChevronRight, Lightbulb, X, FileText, Calendar,
  User, Megaphone, ExternalLink,
} from 'lucide-react'
import { useDB, useCourse, useLessons } from '@/lib/db-context'
import NotebookPaper, { type NotebookPrefs } from '@/components/course/NotebookPaper'
import LessonNotebookChat from '@/components/course/LessonNotebookChat'
import { TasksMini, AssignmentsMini } from '@/components/course/CourseTabs'
import type { Lesson } from '@/types'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

const DEFAULT_PREFS: NotebookPrefs = {
  paper: 'cream',
  fontFamily: 'serif',
  textSize: 'md',
  lineGap: 'normal',
  showLines: true,
}

export default function CourseNotebookPreview() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const { ready, updateLesson } = useDB()
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
      const s = localStorage.getItem('preview:notebook-prefs')
      if (s) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(s) })
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('preview:notebook-prefs', JSON.stringify(prefs)) } catch {}
  }, [prefs])

  // ── AI panel state: silent by default, user opens when needed ────
  const [aiOpen, setAiOpen] = useState(false)

  // ── Whisper (margin hint) — stub, shows up on long idle ─────────
  const [whisperShown, setWhisperShown] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setWhisperShown(true), 45_000)
  }
  useEffect(() => { triggerIdle(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current) } }, [activeId])

  // ── End-of-chapter coach stub ────────────────────────────
  const [coachMsg, setCoachMsg] = useState<string | null>(null)
  const runCoach = () => {
    setCoachMsg(
      'זה סטאב של מאמן סוף פרק. בגרסה האמיתית, ה-AI יעבור על הסיכום ' +
      'שלך, יציין שני דברים טובים וישאל על משהו אחד שחסר — בלי לשכתב לך.',
    )
  }

  // ── Save editor content ──────────────────────────────────
  const handleEdit = (html: string) => {
    if (!activeLesson) return
    updateLesson(activeLesson.id, { content: html })
    triggerIdle()
  }
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
          onClick={() => router.push(`/courses/${courseId}`)}
          className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5"
          title="חזרה לתצוגה הרגילה"
        >
          <ArrowRight size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold truncate">{course.title}</h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">
              תצוגה חדשה · ספייק
            </span>
          </div>
          <div className="text-xs text-ink-muted mt-0.5">
            {course.academic_year && `שנת ${course.academic_year} · `}
            {course.semester && `סמסטר ${course.semester} · `}
            {completedCount} מתוך {lessons.length} פרקים הושלמו
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
            <div className="px-2 py-3 text-xs text-ink-muted">
              אין עדיין פרקים. חזור לתצוגה הרגילה כדי להוסיף שיעור ראשון.
            </div>
          ) : (
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
          )}
        </aside>

        {/* Focused chapter */}
        <div className="relative">
          {activeLesson ? (
            <NotebookPaper
              {...prefs}
              onChange={(patch) => setPrefs(p => ({ ...p, ...patch }))}
              title={`פרק ${lessons.findIndex(l => l.id === activeLesson.id) + 1} · ${activeLesson.title}`}
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
                placeholder="כתוב את הסיכום שלך כאן. ה-AI שקט אלא אם תבקש ממנו משהו."
              />
            </NotebookPaper>
          ) : (
            <div className="glass rounded-2xl p-10 text-center text-ink-muted">
              בחר פרק מהתוכן כדי להתחיל לכתוב.
            </div>
          )}

          {/* Chapter actions strip */}
          {activeLesson && (
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
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
              <button
                onClick={runCoach}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25"
                title="קבל משוב קצר על מה שכתבת"
              >
                <Sparkles size={13} /> קבל משוב על הפרק
              </button>
            </div>
          )}

          {/* Coach message (stub) */}
          <AnimatePresence>
            {coachMsg && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mt-3 glass rounded-xl p-3 text-xs flex items-start gap-2 border border-violet-500/20"
              >
                <Sparkles size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">{coachMsg}</div>
                <button onClick={() => setCoachMsg(null)} className="text-ink-muted hover:text-ink">
                  <X size={13} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Margin whisper (stub — shows after idle) */}
          <AnimatePresence>
            {whisperShown && activeLesson && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute -left-3 top-24 w-52 p-3 rounded-xl text-[11px] glass border border-amber-400/20 hidden xl:block"
                style={{ background: 'rgba(251, 191, 36, 0.05)' }}
              >
                <div className="flex items-start gap-1.5">
                  <Lightbulb size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-amber-200/90">
                    (סטאב לחישה) נראה שעצרת לרגע — תרצה שאסביר משהו?
                  </div>
                  <button onClick={() => setWhisperShown(false)} className="text-ink-muted hover:text-ink">
                    <X size={11} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MoodleCard icon={FileText} title="קבצים רשמיים" hint="PDF מהקורס">
            <StubList items={[
              'הרצאה 1 — מבוא',
              'הרצאה 2 — בסיסי',
              'תרגול שבוע 1',
            ]} emptyText="אין עדיין קבצים." />
          </MoodleCard>

          <MoodleCard icon={Calendar} title="סילבוס ולו״ז" hint="תאריכים מרכזיים">
            <StubList items={[
              'תחילת סמסטר: 27.10',
              'תרגיל 1: 15.11',
              'בחינת אמצע: 18.12',
              'מבחן סופי: בתיאום',
            ]} emptyText="אין עדיין תאריכים." />
          </MoodleCard>

          <MoodleCard icon={User} title="פרטי מרצה" hint="יצירת קשר">
            <div className="text-xs space-y-1 text-ink-muted">
              <div className="text-ink">(סטאב) ד״ר דוגמה</div>
              <div>שעת קבלה: יום ג׳ 14:00</div>
              <div className="flex items-center gap-1">
                <ExternalLink size={10} />
                <span>example@bgu.ac.il</span>
              </div>
            </div>
          </MoodleCard>

          <MoodleCard icon={Megaphone} title="הודעות מ-Moodle" hint="הכרזות מרצה">
            <StubList items={[
              '(סטאב) תרגיל 2 נדחה בשבוע',
              'זום לתרגול שלישי: נפתח שעה מוקדם יותר',
            ]} emptyText="אין הודעות חדשות." />
          </MoodleCard>
        </div>

        <div className="mt-4 text-[11px] text-ink-muted border-t border-white/5 pt-3">
          <b className="text-ink-muted">הערת ספייק:</b> כל הכרטיסים למעלה הם סטאבים.
          בפרודקשן, הנתונים ייקראו מ-Moodle כשמריצים סנכרון — קבצים אמיתיים,
          תאריכי הגשה אמיתיים, פרטי מרצה אמיתיים. כל אלה ישמשו גם כמקורות של
          ה-AI (במקום פיצ׳ר /notebooks הנפרד).
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

function StubList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) {
    return <div className="text-[11px] text-ink-muted">{emptyText}</div>
  }
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="text-[11px] text-ink-muted flex items-start gap-1.5">
          <span className="text-indigo-400 mt-0.5">·</span>
          <span className="flex-1">{t}</span>
        </li>
      ))}
    </ul>
  )
}
