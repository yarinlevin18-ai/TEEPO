'use client'

/**
 * Lesson notebook — the focused workspace for a single lesson.
 *
 * Layout:
 *   ┌─────────────── breadcrumb ───────────────┐
 *   │ [← חזרה]   שנה ב׳ · סמסטר א׳ · קורס › שיעור 4 │
 *   ├──────────────────┬──────────────────────┤
 *   │                  │                      │
 *   │   Rich editor    │   AI Notebook chat   │
 *   │   (lesson.content)│   (grounded, notebook)│
 *   │                  │                      │
 *   ├──────────────────┴──────────────────────┤
 *   │  משימות (per-lesson)  │  מטלות (read-only) │
 *   └─────────────────────────────────────────┘
 *
 * The parent course page navigates into this route when a lesson is
 * clicked. Notes autosave via `updateLesson` and a Word export button
 * reuses the existing `exportNoteToWord` helper.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ChevronLeft, Loader2, FileDown,
  CheckSquare, FileText, Calendar, Sparkles, Wand2,
  Trash2, ExternalLink, FileUp, Plus, Check, X,
  BookOpen, FolderOpen, File as FileIcon, Presentation,
  Image as ImageIcon, Mic, Square, Upload, StopCircle,
  ArrowLeft,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  useDB, useCourse, useLessons,
} from '@/lib/db-context'
import { exportNoteToWord } from '@/lib/export-to-word'
import { semesterLabel } from '@/lib/semester-classifier'
import QuickAddInput from '@/components/course/QuickAddInput'
import LessonNotebookChat from '@/components/course/LessonNotebookChat'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { StudyTask, Assignment, LessonFile } from '@/types'
import { format } from 'date-fns'

function fileIcon(type: string) {
  switch (type) {
    case 'pdf': return <FileText size={13} className="text-red-400" />
    case 'pptx': return <Presentation size={13} className="text-orange-400" />
    case 'doc': return <FileText size={13} className="text-blue-400" />
    case 'image': return <ImageIcon size={13} className="text-emerald-400" />
    case 'gdrive': return <FolderOpen size={13} className="text-yellow-400" />
    default: return <FileIcon size={13} className="text-ink-muted" />
  }
}

function guessFileType(name: string, url: string): LessonFile['type'] {
  const lower = (name + url).toLowerCase()
  if (lower.includes('.pdf')) return 'pdf'
  if (lower.includes('.ppt') || lower.includes('.pptx')) return 'pptx'
  if (lower.includes('.doc') || lower.includes('.docx')) return 'doc'
  if (/\.(png|jpg|jpeg|gif|webp|svg)/.test(lower)) return 'image'
  if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) return 'gdrive'
  return 'link'
}

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function LessonNotebookPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string
  const lessonId = params.lessonId as string

  const { ready, loading, error: dbError, updateLesson, createTask, updateTask, deleteTask, db } = useDB()
  const course = useCourse(courseId)
  const lessons = useLessons(courseId)
  const lesson = lessons.find(l => l.id === lessonId)

  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [summarizing, setSummarizing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialisedRef = useRef(false)

  // Neighbours for the prev/next recap bands
  const sortedLessons = [...lessons].sort((a, b) => a.order_index - b.order_index)
  const myIdx = sortedLessons.findIndex(l => l.id === lessonId)
  const prevLesson = myIdx > 0 ? sortedLessons[myIdx - 1] : null
  const nextLesson = myIdx >= 0 && myIdx < sortedLessons.length - 1 ? sortedLessons[myIdx + 1] : null

  // Recording + transcription
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Hydrate editor once when the lesson data arrives
  useEffect(() => {
    if (!lesson || initialisedRef.current) return
    setContent(lesson.content || '')
    initialisedRef.current = true
  }, [lesson])

  useEffect(() => {
    if (dbError) setError(dbError)
  }, [dbError])

  // Debounced autosave for lesson.content
  useEffect(() => {
    if (!lesson || !initialisedRef.current) return
    if (content === (lesson.content || '')) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveState('saving')
    debounceRef.current = setTimeout(async () => {
      try {
        await updateLesson(lesson.id, { content })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1500)
      } catch {
        setSaveState('error')
      }
    }, 1000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, lesson?.id])

  const handleSummarize = useCallback(async () => {
    if (!lesson) return
    const text = content || lesson.content || lesson.title
    if (!text) return
    setSummarizing(true)
    try {
      const result = await api.lessons.summarize(text, lesson.title)
      const summary = result.result || result.summary || result.answer
      await updateLesson(lesson.id, { ai_summary: summary })
    } catch {
      setError('שגיאה ביצירת סיכום AI.')
    } finally {
      setSummarizing(false)
    }
  }, [lesson, content, updateLesson])

  const handleExport = () => {
    if (!lesson || !course) return
    exportNoteToWord({
      title: `${course.title} — ${lesson.title}`,
      html: content || lesson.content || '',
      rtl: true,
    })
  }

  // ── Recording: browser MediaRecorder → upload to /transcribe ──
  const startRecording = async () => {
    if (recording || transcribing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await uploadRecording(blob, 'recording.webm')
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch (e: any) {
      setError(e?.message?.includes('Permission') ? 'אין הרשאה למיקרופון.' : 'שגיאה בהתחלת ההקלטה.')
    }
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    setRecording(false)
  }

  const uploadRecording = async (blob: Blob, filename: string) => {
    if (!lesson) return
    setTranscribing(true)
    try {
      const res = await api.lessons.transcribe(lesson.id, blob, filename)
      // Backend already saved transcript+recap, but refresh locally so UI
      // sees it without waiting for the next DB poll.
      await updateLesson(lesson.id, {
        transcript: res.transcript,
        ...(res.summary ? { recap: res.summary } : {}),
      })
    } catch (e: any) {
      setError(e?.message || 'תמלול נכשל.')
    } finally {
      setTranscribing(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    await uploadRecording(f, f.name)
  }

  // ── Auto-summarize when leaving (creates/updates lesson.ai_summary silently) ──
  // We reuse `summarize` only when the user has written enough content AND
  // no recent ai_summary exists — so we don't spam tokens on every back-nav.
  useEffect(() => {
    return () => {
      const current = lesson
      if (!current) return
      const plain = (content || current.content || '').replace(/<[^>]*>/g, '').trim()
      if (plain.length < 120) return           // too short to summarize
      if (current.ai_summary && current.ai_summary.length > 40) return // fresh enough
      // Fire-and-forget: we can't await in cleanup reliably, but the HTTP
      // call still flushes to the backend.
      api.lessons
        .summarize(plain.slice(0, 8000), current.title)
        .then(r => {
          const summary = r.result || r.summary || r.answer
          if (summary) return updateLesson(current.id, { ai_summary: summary, recap: summary })
        })
        .catch(() => { /* silent — best-effort */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  // Per-lesson tasks (now scoped by lesson_id)
  const lessonTasks = db.tasks.filter(t => t.lesson_id === lessonId)
  const pendingTasks = lessonTasks.filter(t => !t.is_completed)
  const doneTasks = lessonTasks.filter(t => t.is_completed)

  // Course-level assignments (read-only here)
  const assignments = db.assignments.filter(a => a.course_id === courseId)

  // ── File management ──
  const [addingFile, setAddingFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFileUrl, setNewFileUrl] = useState('')

  const addFile = async () => {
    if (!lesson) return
    const name = newFileName.trim()
    const url = newFileUrl.trim()
    if (!name || !url) return
    const file: LessonFile = { name, url, type: guessFileType(name, url) }
    try {
      await updateLesson(lesson.id, { files: [...(lesson.files || []), file] })
      setNewFileName('')
      setNewFileUrl('')
      setAddingFile(false)
    } catch {
      setError('שגיאה בהוספת קובץ.')
    }
  }

  const removeFile = async (index: number) => {
    if (!lesson) return
    const updated = (lesson.files || []).filter((_, i) => i !== index)
    try {
      await updateLesson(lesson.id, { files: updated })
    } catch {
      setError('שגיאה במחיקת קובץ.')
    }
  }

  // ── Loading / guards ──
  if (loading || !ready) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 animate-fade-in">
        <div className="h-5 w-48 shimmer rounded-lg" />
        <div className="h-7 w-80 shimmer rounded-lg" />
        <div className="grid lg:grid-cols-2 gap-4 mt-6">
          <div className="h-96 shimmer rounded-2xl" />
          <div className="h-96 shimmer rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="p-6 max-w-3xl mx-auto animate-fade-in">
        <ErrorAlert message={error || 'הקורס לא נמצא'} />
        <Link href="/courses" className="mt-4 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300">
          <ArrowRight size={14} /> חזרה לקורסים
        </Link>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="p-6 max-w-3xl mx-auto animate-fade-in">
        <ErrorAlert message="השיעור לא נמצא" />
        <Link href={`/courses/${courseId}`} className="mt-4 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300">
          <ArrowRight size={14} /> חזרה לקורס
        </Link>
      </div>
    )
  }

  const crumbClass = course.year_of_study || course.semester
    ? semesterLabel(course.year_of_study, course.semester)
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in"
    >
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* ── Breadcrumb row ── */}
      <div className="flex items-center gap-2 text-xs text-ink-muted mb-4 flex-wrap">
        <button
          onClick={() => router.push(`/courses/${courseId}`)}
          className="inline-flex items-center gap-1.5 hover:text-ink transition-colors"
        >
          <ChevronLeft size={14} /> חזרה לקורס
        </button>
        <span className="text-ink-subtle">·</span>
        {crumbClass && (
          <>
            <span>{crumbClass}</span>
            <span className="text-ink-subtle">›</span>
          </>
        )}
        <Link href={`/courses/${courseId}`} className="hover:text-ink transition-colors truncate max-w-[220px]">
          {course.title}
        </Link>
        <span className="text-ink-subtle">›</span>
        <span className="text-ink font-medium truncate">{lesson.title}</span>
      </div>

      {/* ── Prev chapter recap ── */}
      {prevLesson && (prevLesson.recap || prevLesson.ai_summary) && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3"
        >
          <Link
            href={`/courses/${courseId}/lessons/${prevLesson.id}`}
            className="block group rounded-2xl border border-white/5 bg-gradient-to-l from-indigo-500/[0.06] to-transparent hover:from-indigo-500/[0.1] transition-colors px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                <ArrowRight size={14} className="text-indigo-300 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle font-semibold">
                  מה היה בפרק הקודם
                </p>
                <p className="text-xs text-ink-muted line-clamp-2 mt-0.5">
                  <span className="text-ink font-medium">{prevLesson.title}</span>
                  <span className="mx-1.5 text-ink-subtle">·</span>
                  {prevLesson.recap || prevLesson.ai_summary}
                </p>
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* ── Lesson header ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05 }}
        className="flex items-start gap-3 mb-5"
      >
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/25 to-violet-500/25 flex items-center justify-center flex-shrink-0">
          <BookOpen size={22} className="text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-ink truncate">{lesson.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted flex-wrap">
            <span>{course.title}</span>
            {lesson.files && lesson.files.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <FileUp size={11} /> {lesson.files.length} קבצים
              </span>
            )}
            {lesson.is_completed && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <Check size={11} /> הושלם
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SaveIndicator state={saveState} />

          {/* Record / stop */}
          {recording ? (
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-colors animate-pulse"
              title="עצור הקלטה"
            >
              <StopCircle size={12} /> עצור
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={transcribing}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
              title="הקלט שיעור"
            >
              {transcribing ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
              {transcribing ? 'מתמלל…' : 'הקלט'}
            </button>
          )}

          {/* Upload audio file */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={transcribing || recording}
            className="hidden md:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
            title="העלה קובץ אודיו לתמלול"
          >
            <Upload size={12} /> העלה
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/mp4,video/webm"
            onChange={handleFileUpload}
            className="hidden"
          />

          <button
            onClick={handleSummarize}
            disabled={summarizing || !(content || lesson.content)}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
            title="סכם את הסיכום הזה עם AI"
          >
            {summarizing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            {summarizing ? 'מסכם…' : 'סכם AI'}
          </button>
          <button
            onClick={handleExport}
            disabled={!content && !lesson.content}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors disabled:opacity-40"
            title="הורד כ-Word"
          >
            <FileDown size={12} />
            Word
          </button>
        </div>
      </motion.div>

      {/* ── Main 2-column layout ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* LEFT — Rich editor */}
        <motion.section
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl overflow-hidden min-h-[480px] flex flex-col"
        >
          <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">סיכום השיעור</span>
            {lesson.ai_summary && (
              <details className="relative">
                <summary className="list-none cursor-pointer text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles size={10} /> סיכום AI קיים
                  </span>
                </summary>
                <div className="absolute left-0 mt-1 w-80 max-h-64 overflow-y-auto p-3 rounded-xl bg-[#141222] border border-white/10 shadow-xl z-10 text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                  {lesson.ai_summary}
                </div>
              </details>
            )}
          </div>
          <div className="flex-1 flex flex-col lesson-editor">
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="כתוב כאן את הסיכום של השיעור. שורה ריקה = פסקה חדשה. לחץ על ה-toolbar לעיצוב. הכל נשמר אוטומטית."
            />
          </div>
          <style jsx>{`
            .lesson-editor :global(.rich-editor-content) {
              min-height: 420px;
              padding: 18px 22px;
              font-size: 14.5px;
              line-height: 1.75;
            }
          `}</style>
        </motion.section>

        {/* RIGHT — AI Notebook chat */}
        <motion.section
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="min-h-[480px] flex"
        >
          <LessonNotebookChat
            lesson={lesson}
            courseId={courseId}
            courseTitle={course.title}
          />
        </motion.section>
      </div>

      {/* ── Files strip ── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="glass rounded-2xl p-3 mt-4"
      >
        <div className="flex items-center justify-between px-1 mb-2">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <FileUp size={14} className="text-amber-400" />
            קבצים ומקורות
            {lesson.files && lesson.files.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                {lesson.files.length}
              </span>
            )}
          </h3>
          <button
            onClick={() => setAddingFile(v => !v)}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-ink-muted hover:text-amber-300 hover:bg-amber-500/10 transition-all flex items-center gap-1"
          >
            <Plus size={11} /> הוסף קישור
          </button>
        </div>

        <AnimatePresence>
          {addingFile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-2"
            >
              <div className="flex gap-2 items-end p-2">
                <div className="flex-1 space-y-1.5">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={e => setNewFileName(e.target.value)}
                    placeholder='שם הקובץ, למשל "מצגת שיעור 1"'
                    className="input-dark w-full text-xs"
                  />
                  <input
                    type="url"
                    value={newFileUrl}
                    onChange={e => setNewFileUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addFile() }}
                    placeholder="קישור (Google Drive, Dropbox, URL…)"
                    className="input-dark w-full text-xs"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={addFile}
                  disabled={!newFileName.trim() || !newFileUrl.trim()}
                  className="btn-gradient px-3 py-2 rounded-lg text-xs text-white font-medium disabled:opacity-40"
                >
                  הוסף
                </button>
                <button
                  onClick={() => { setAddingFile(false); setNewFileName(''); setNewFileUrl('') }}
                  className="p-2 text-ink-muted hover:text-ink transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {lesson.files && lesson.files.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {lesson.files.map((f, fi) => (
              <div
                key={fi}
                className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
              >
                {fileIcon(f.type)}
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ink hover:text-indigo-300 transition-colors truncate max-w-[240px]"
                >
                  {f.name}
                </a>
                <button
                  onClick={() => removeFile(fi)}
                  className="p-0.5 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : !addingFile ? (
          <p className="text-[11px] text-ink-subtle text-center py-2">
            אין קבצים. הוסף מצגות, PDF או קישורי Drive.
          </p>
        ) : null}
      </motion.section>

      {/* ── Bottom: Tasks + Assignments ── */}
      <div className="grid gap-4 mt-4 md:grid-cols-2">
        {/* Lesson tasks */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="glass rounded-2xl p-3 space-y-2"
        >
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <CheckSquare size={14} className="text-indigo-400" />
              משימות לשיעור
              {pendingTasks.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-medium">
                  {pendingTasks.length}
                </span>
              )}
            </h3>
          </div>

          <QuickAddInput
            placeholder="משימה לשיעור, למשל: לפתור תרגיל 3…"
            accent="indigo"
            onAdd={text =>
              createTask({
                title: text,
                course_id: courseId,
                lesson_id: lessonId,
                scheduled_date: format(new Date(), 'yyyy-MM-dd'),
                category: 'study',
              })
            }
          />

          {lessonTasks.length === 0 ? (
            <p className="text-[11px] text-ink-subtle text-center py-3">
              אין משימות לשיעור הזה עדיין.
            </p>
          ) : (
            <div className="space-y-1">
              {pendingTasks.map(t => (
                <LessonTaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />
              ))}
              {doneTasks.length > 0 && (
                <details className="pt-1">
                  <summary className="text-[11px] text-ink-subtle cursor-pointer hover:text-ink px-1 py-1">
                    הושלמו ({doneTasks.length})
                  </summary>
                  <div className="space-y-1 mt-1">
                    {doneTasks.map(t => (
                      <LessonTaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </motion.section>

        {/* Course assignments — read-only */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="glass rounded-2xl p-3 space-y-2"
        >
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <FileText size={14} className="text-amber-400" />
              מטלות הקורס
              {assignments.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                  {assignments.length}
                </span>
              )}
            </h3>
            <Link
              href={`/courses/${courseId}`}
              className="text-[11px] text-ink-subtle hover:text-ink inline-flex items-center gap-1"
            >
              ערוך בקורס <ExternalLink size={10} />
            </Link>
          </div>

          {assignments.length === 0 ? (
            <p className="text-[11px] text-ink-subtle text-center py-3">
              אין מטלות פתוחות לקורס.
            </p>
          ) : (
            <div className="space-y-1">
              {assignments.map(a => <ReadOnlyAssignmentRow key={a.id} a={a} />)}
            </div>
          )}
        </motion.section>
      </div>

      {/* ── Transcript viewer ── */}
      {lesson.transcript && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-4 mt-4"
        >
          <details>
            <summary className="cursor-pointer flex items-center gap-2 select-none">
              <Mic size={14} className="text-rose-400" />
              <span className="text-sm font-semibold text-ink">תמלול השיעור</span>
              <span className="text-[10px] text-ink-subtle">
                ({Math.round(lesson.transcript.length / 1000)}K תווים)
              </span>
              <ChevronLeft size={12} className="text-ink-subtle mr-auto transition-transform group-open:-rotate-90" />
            </summary>
            <pre className="mt-3 text-xs text-ink-muted leading-relaxed whitespace-pre-wrap font-sans max-h-72 overflow-y-auto p-3 rounded-xl bg-white/[0.02]">
              {lesson.transcript}
            </pre>
          </details>
        </motion.section>
      )}

      {/* ── Next chapter teaser ── */}
      {nextLesson && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          className="mt-4"
        >
          <Link
            href={`/courses/${courseId}/lessons/${nextLesson.id}`}
            className="block group rounded-2xl border border-white/5 bg-gradient-to-r from-violet-500/[0.06] to-transparent hover:from-violet-500/[0.1] transition-colors px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0 text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle font-semibold">
                  הפרק הבא
                </p>
                <p className="text-sm text-ink font-medium truncate">{nextLesson.title}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                <ArrowLeft size={16} className="text-violet-300 group-hover:-translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>
        </motion.div>
      )}
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <AnimatePresence mode="wait">
      {state !== 'idle' && (
        <motion.span
          key={state}
          initial={{ opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full flex-shrink-0"
          style={{
            color: state === 'saving' ? '#B8A9FF' : state === 'saved' ? '#4ADE80' : '#FF6B6B',
            background:
              state === 'saving'
                ? 'rgba(139,127,240,0.15)'
                : state === 'saved'
                ? 'rgba(74,222,128,0.15)'
                : 'rgba(255,107,107,0.15)',
          }}
        >
          {state === 'saving' && <Loader2 size={10} className="animate-spin" />}
          {state === 'saved' && <Check size={10} />}
          {state === 'error' && <X size={10} />}
          {state === 'saving' ? 'שומר…' : state === 'saved' ? 'נשמר' : 'שגיאה'}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function LessonTaskRow({
  task, onToggle, onDelete,
}: {
  task: StudyTask
  onToggle: (id: string, patch: Partial<StudyTask>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group transition-colors">
      <button
        onClick={() => onToggle(task.id, { is_completed: !task.is_completed })}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
          task.is_completed ? 'bg-emerald-500/80 border-emerald-500' : 'border-white/15 hover:border-indigo-400'
        }`}
      />
      <span className={`text-sm flex-1 truncate ${task.is_completed ? 'text-ink-muted line-through' : 'text-ink'}`}>
        {task.title}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="p-0.5 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

function ReadOnlyAssignmentRow({ a }: { a: Assignment }) {
  const priorityDot: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
  }
  const statusLabel: Record<Assignment['status'], string> = {
    todo: 'לא התחיל',
    in_progress: 'בתהליך',
    submitted: 'הוגש',
    graded: 'נבדק',
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: priorityDot[a.priority] }}
      />
      <span className="text-sm flex-1 truncate text-ink">{a.title}</span>
      {a.deadline && (
        <span className="text-[10px] text-ink-subtle flex items-center gap-0.5 flex-shrink-0">
          <Calendar size={9} /> {a.deadline.slice(5)}
        </span>
      )}
      <span className="text-[10px] text-ink-subtle flex-shrink-0">{statusLabel[a.status]}</span>
    </div>
  )
}
