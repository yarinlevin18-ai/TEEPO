'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ExternalLink, ArrowRight, CheckCircle2,
  FileText, Sparkles, Loader2, ChevronDown, Plus,
  PenLine, Upload, Trash2, Save, X, Clock,
  StickyNote, Wand2, FileUp, Edit3, Link2,
  File, Image as ImageIcon, Presentation, GripVertical,
  FolderOpen,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api-client'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { Course, Lesson, LessonFile } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

// ── Helpers ─────────────────────────────────────────────────

interface CourseDetail extends Course {
  lessons: Lesson[]
}

function fileIcon(type: string) {
  switch (type) {
    case 'pdf': return <FileText size={14} className="text-red-400" />
    case 'pptx': return <Presentation size={14} className="text-orange-400" />
    case 'doc': return <FileText size={14} className="text-blue-400" />
    case 'image': return <ImageIcon size={14} className="text-emerald-400" />
    case 'gdrive': return <FolderOpen size={14} className="text-yellow-400" />
    default: return <File size={14} className="text-ink-muted" />
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

// ── Component ───────────────────────────────────────────────

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.id as string

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Lesson management
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)
  const [lessonContent, setLessonContent] = useState('')
  const [savingLesson, setSavingLesson] = useState(false)
  const [summarizing, setSummarizing] = useState<string | null>(null)

  // New lesson
  const [showNewLesson, setShowNewLesson] = useState(false)
  const [newLessonTitle, setNewLessonTitle] = useState('')

  // File link
  const [addingFileToLesson, setAddingFileToLesson] = useState<string | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [newFileUrl, setNewFileUrl] = useState('')

  const newLessonInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!courseId) return
    const load = async () => {
      try {
        const courseData = await api.courses.get(courseId)
        setCourse(courseData)
      } catch {
        setError('שגיאה בטעינת הקורס.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseId])

  // ── Create lesson ──
  const createLesson = useCallback(async () => {
    const title = newLessonTitle.trim()
    if (!title) return
    try {
      const created = await api.lessons.create(courseId, { title })
      setCourse(prev => prev ? { ...prev, lessons: [...prev.lessons, created] } : prev)
      setNewLessonTitle('')
      setShowNewLesson(false)
      // Auto-expand the new lesson
      setExpandedLesson(created.id)
    } catch {
      setError('שגיאה ביצירת שיעור.')
    }
  }, [courseId, newLessonTitle])

  // ── Delete lesson ──
  const deleteLesson = useCallback(async (lessonId: string) => {
    const backup = course?.lessons.find(l => l.id === lessonId)
    setCourse(prev => prev ? { ...prev, lessons: prev.lessons.filter(l => l.id !== lessonId) } : prev)
    try {
      await api.lessons.delete(lessonId)
    } catch {
      if (backup) setCourse(prev => prev ? { ...prev, lessons: [...prev.lessons, backup] } : prev)
      setError('שגיאה במחיקת שיעור.')
    }
  }, [course])

  // ── Toggle completion ──
  const toggleLesson = useCallback(async (lessonId: string) => {
    const lesson = course?.lessons.find(l => l.id === lessonId)
    if (!lesson) return
    const newVal = !lesson.is_completed
    setCourse(prev => prev ? {
      ...prev,
      lessons: prev.lessons.map(l => l.id === lessonId ? { ...l, is_completed: newVal } : l),
    } : prev)
    try {
      await api.lessons.update(lessonId, { is_completed: newVal })
    } catch {
      setCourse(prev => prev ? {
        ...prev,
        lessons: prev.lessons.map(l => l.id === lessonId ? { ...l, is_completed: !newVal } : l),
      } : prev)
    }
  }, [course])

  // ── Start editing notes for a lesson ──
  const startEditing = useCallback((lesson: Lesson) => {
    setEditingLessonId(lesson.id)
    setLessonContent(lesson.content || '')
  }, [])

  // ── Save lesson notes ──
  const saveLessonContent = useCallback(async (lessonId: string) => {
    setSavingLesson(true)
    try {
      await api.lessons.update(lessonId, { content: lessonContent })
      setCourse(prev => prev ? {
        ...prev,
        lessons: prev.lessons.map(l => l.id === lessonId ? { ...l, content: lessonContent } : l),
      } : prev)
      setEditingLessonId(null)
    } catch {
      setError('שגיאה בשמירת הסיכום.')
    } finally {
      setSavingLesson(false)
    }
  }, [lessonContent])

  // ── AI summarize lesson content ──
  const handleSummarize = useCallback(async (lesson: Lesson) => {
    const text = lesson.content || lesson.title
    if (!text) return
    setSummarizing(lesson.id)
    try {
      const result = await api.lessons.summarize(text, lesson.title)
      const summary = result.result || result.summary || result.answer
      await api.lessons.update(lesson.id, { ai_summary: summary })
      setCourse(prev => prev ? {
        ...prev,
        lessons: prev.lessons.map(l => l.id === lesson.id ? { ...l, ai_summary: summary } : l),
      } : prev)
    } catch {
      setError('שגיאה ביצירת סיכום.')
    } finally {
      setSummarizing(null)
    }
  }, [])

  // ── Add file link to lesson ──
  const addFileToLesson = useCallback(async (lessonId: string) => {
    const name = newFileName.trim()
    const url = newFileUrl.trim()
    if (!name || !url) return
    const file: LessonFile = { name, url, type: guessFileType(name, url) }
    const lesson = course?.lessons.find(l => l.id === lessonId)
    const updatedFiles = [...(lesson?.files || []), file]

    // Optimistic update
    setCourse(prev => prev ? {
      ...prev,
      lessons: prev.lessons.map(l => l.id === lessonId ? { ...l, files: updatedFiles } : l),
    } : prev)
    setNewFileName('')
    setNewFileUrl('')
    setAddingFileToLesson(null)

    try {
      await api.lessons.update(lessonId, { files: updatedFiles })
    } catch {
      // Revert
      setCourse(prev => prev ? {
        ...prev,
        lessons: prev.lessons.map(l => l.id === lessonId ? { ...l, files: lesson?.files || [] } : l),
      } : prev)
      setError('שגיאה בהוספת קובץ.')
    }
  }, [newFileName, newFileUrl, course])

  // ── Remove file from lesson ──
  const removeFile = useCallback(async (lessonId: string, fileIndex: number) => {
    const lesson = course?.lessons.find(l => l.id === lessonId)
    if (!lesson) return
    const updatedFiles = (lesson.files || []).filter((_, i) => i !== fileIndex)

    setCourse(prev => prev ? {
      ...prev,
      lessons: prev.lessons.map(l => l.id === lessonId ? { ...l, files: updatedFiles } : l),
    } : prev)

    try {
      await api.lessons.update(lessonId, { files: updatedFiles })
    } catch {
      setCourse(prev => prev ? {
        ...prev,
        lessons: prev.lessons.map(l => l.id === lessonId ? { ...l, files: lesson.files } : l),
      } : prev)
    }
  }, [course])

  // ── Loading ──
  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="h-8 w-64 shimmer rounded-lg" />
        <div className="h-4 w-48 shimmer rounded-lg" />
        <div className="space-y-3 mt-8">
          {[1, 2, 3].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
        <ErrorAlert message={error || 'הקורס לא נמצא'} />
        <Link href="/courses" className="mt-4 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors">
          <ArrowRight size={14} /> חזרה לקורסים
        </Link>
      </div>
    )
  }

  const completedLessons = course.lessons.filter(l => l.is_completed).length
  const progress = course.lessons.length > 0
    ? Math.round((completedLessons / course.lessons.length) * 100)
    : 0

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-5 animate-fade-in">
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Back */}
      <Link href="/courses" className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors">
        <ArrowRight size={14} /> חזרה לקורסים
      </Link>

      {/* ── Course Header ── */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={22} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink">{course.title}</h1>
            {course.description && (
              <p className="text-sm text-ink-muted mt-1 line-clamp-2">{course.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                course.source === 'bgu'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}>
                {course.source === 'bgu' ? 'BGU Moodle' : course.source}
              </span>
              {course.source_url && (
                <a href={course.source_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors">
                  <ExternalLink size={12} /> פתח ב-Moodle
                </a>
              )}
              <span className="text-xs text-ink-muted">
                {course.lessons.length} שיעורים
              </span>
            </div>
          </div>
        </div>

        {/* Progress */}
        {course.lessons.length > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-ink-muted mb-2">
              <span>התקדמות</span>
              <span>{completedLessons}/{course.lessons.length} ({progress}%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5">
              <motion.div
                className="h-2 rounded-full"
                style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Lessons Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <StickyNote size={16} className="text-indigo-400" />
          שיעורים
        </h2>
        <button
          onClick={() => { setShowNewLesson(true); setTimeout(() => newLessonInputRef.current?.focus(), 100) }}
          className="btn-gradient px-3.5 py-2 rounded-xl text-sm text-white font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
        >
          <Plus size={15} />
          שיעור חדש
        </button>
      </div>

      {/* ── New Lesson Input ── */}
      <AnimatePresence>
        {showNewLesson && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <input
                ref={newLessonInputRef}
                type="text"
                value={newLessonTitle}
                onChange={e => setNewLessonTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createLesson(); if (e.key === 'Escape') setShowNewLesson(false) }}
                placeholder='שם השיעור, למשל "שיעור 1 — מבוא"'
                className="input-dark flex-1 text-sm"
              />
              <button onClick={createLesson} disabled={!newLessonTitle.trim()}
                className="btn-gradient px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-40">
                הוסף
              </button>
              <button onClick={() => { setShowNewLesson(false); setNewLessonTitle('') }}
                className="p-2 text-ink-muted hover:text-ink transition-colors">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Lessons List ── */}
      {course.lessons.length === 0 && !showNewLesson ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-6 right-10 w-20 h-20 rounded-full bg-indigo-500/10 blur-2xl" />
            <div className="absolute bottom-8 left-12 w-16 h-16 rounded-full bg-violet-500/10 blur-2xl" />
          </div>
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen size={28} className="text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-ink mb-1">אין שיעורים עדיין</h3>
            <p className="text-sm text-ink-muted mb-5 max-w-sm mx-auto">
              הוסף שיעורים לקורס. לכל שיעור תוכל לצרף מצגות, קבצים ולכתוב סיכום.
            </p>
            <button
              onClick={() => { setShowNewLesson(true); setTimeout(() => newLessonInputRef.current?.focus(), 100) }}
              className="btn-gradient px-5 py-2.5 rounded-xl text-sm text-white font-medium inline-flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              <Plus size={15} /> הוסף שיעור ראשון
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {course.lessons.map((lesson, index) => {
            const isExpanded = expandedLesson === lesson.id
            const isEditing = editingLessonId === lesson.id
            const files = lesson.files || []
            const hasContent = !!(lesson.content && lesson.content.replace(/<[^>]*>/g, '').trim())

            return (
              <motion.div
                key={lesson.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="glass rounded-xl overflow-hidden"
              >
                {/* Lesson header row */}
                <button
                  onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                  className="w-full flex items-center gap-3 p-4 text-right hover:bg-white/[0.02] transition-colors"
                >
                  {/* Completion circle */}
                  <span
                    onClick={e => { e.stopPropagation(); toggleLesson(lesson.id) }}
                    className={`w-7 h-7 rounded-full text-xs flex items-center justify-center flex-shrink-0 font-medium cursor-pointer transition-all hover:scale-110 ${
                      lesson.is_completed
                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                        : 'bg-white/5 text-ink-muted hover:bg-indigo-500/15 hover:text-indigo-400'
                    }`}
                    title={lesson.is_completed ? 'סמן כלא הושלם' : 'סמן כהושלם'}
                  >
                    {lesson.is_completed ? <CheckCircle2 size={14} /> : index + 1}
                  </span>

                  {/* Title */}
                  <span className={`text-sm flex-1 text-right font-medium ${
                    lesson.is_completed ? 'text-ink-muted line-through' : 'text-ink'
                  }`}>
                    {lesson.title}
                  </span>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {files.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                        {files.length} קבצים
                      </span>
                    )}
                    {hasContent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">
                        סיכום
                      </span>
                    )}
                    {lesson.ai_summary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400">
                        AI
                      </span>
                    )}
                  </div>

                  <ChevronDown size={14} className={`text-ink-subtle transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* ── Expanded lesson content ── */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">

                        {/* ─── Files section ─── */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                              <FileUp size={12} />
                              קבצים ומצגות
                            </h4>
                            <button
                              onClick={() => { setAddingFileToLesson(addingFileToLesson === lesson.id ? null : lesson.id); setNewFileName(''); setNewFileUrl('') }}
                              className="text-[11px] px-2 py-1 rounded-lg bg-white/5 text-ink-muted hover:text-indigo-400 hover:bg-indigo-500/10 transition-all flex items-center gap-1"
                            >
                              <Plus size={11} /> הוסף קישור
                            </button>
                          </div>

                          {/* File list */}
                          {files.length > 0 && (
                            <div className="space-y-1.5 mb-2">
                              {files.map((f, fi) => (
                                <div key={fi} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] group">
                                  {fileIcon(f.type)}
                                  <a href={f.url} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-ink hover:text-indigo-400 transition-colors flex-1 truncate">
                                    {f.name}
                                  </a>
                                  <button
                                    onClick={() => removeFile(lesson.id, fi)}
                                    className="p-1 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add file form */}
                          <AnimatePresence>
                            {addingFileToLesson === lesson.id && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="flex gap-2 items-end mt-2">
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
                                      onKeyDown={e => { if (e.key === 'Enter') addFileToLesson(lesson.id) }}
                                      placeholder="קישור (Google Drive, Dropbox, URL...)"
                                      className="input-dark w-full text-xs"
                                      dir="ltr"
                                    />
                                  </div>
                                  <button
                                    onClick={() => addFileToLesson(lesson.id)}
                                    disabled={!newFileName.trim() || !newFileUrl.trim()}
                                    className="btn-gradient px-3 py-2 rounded-lg text-xs text-white font-medium disabled:opacity-40 flex-shrink-0"
                                  >
                                    הוסף
                                  </button>
                                </div>
                                <p className="text-[10px] text-ink-subtle mt-1.5">
                                  העלה את הקובץ ל-Google Drive ואז הדבק כאן את הקישור לשיתוף.
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* ─── Notes/Summary section ─── */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                              <PenLine size={12} />
                              סיכום השיעור
                            </h4>
                            {!isEditing && (
                              <button
                                onClick={() => startEditing(lesson)}
                                className="text-[11px] px-2 py-1 rounded-lg bg-white/5 text-ink-muted hover:text-indigo-400 hover:bg-indigo-500/10 transition-all flex items-center gap-1"
                              >
                                <Edit3 size={11} /> {hasContent ? 'ערוך' : 'כתוב סיכום'}
                              </button>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-3">
                              <RichTextEditor
                                content={lessonContent}
                                onChange={setLessonContent}
                                placeholder="כתוב את הסיכום שלך כאן..."
                              />
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={() => handleSummarize({ ...lesson, content: lessonContent || lesson.content })}
                                  disabled={summarizing === lesson.id || !(lessonContent || lesson.content)}
                                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                                >
                                  {summarizing === lesson.id ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                  {summarizing === lesson.id ? 'מסכם...' : 'סכם עם AI'}
                                </button>
                                <div className="flex gap-2">
                                  <button onClick={() => setEditingLessonId(null)}
                                    className="px-3 py-1.5 text-ink-muted hover:text-ink text-xs transition-colors rounded-lg">
                                    ביטול
                                  </button>
                                  <button
                                    onClick={() => saveLessonContent(lesson.id)}
                                    disabled={savingLesson}
                                    className="btn-gradient px-4 py-1.5 rounded-lg text-xs text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                                  >
                                    {savingLesson ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                    {savingLesson ? 'שומר...' : 'שמור'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : hasContent ? (
                            <div
                              className="note-display text-sm leading-relaxed text-ink-muted cursor-pointer hover:bg-white/[0.02] rounded-lg p-3 -mx-1 transition-colors"
                              onClick={() => startEditing(lesson)}
                              dangerouslySetInnerHTML={{ __html: lesson.content! }}
                            />
                          ) : (
                            <button
                              onClick={() => startEditing(lesson)}
                              className="w-full py-6 rounded-xl border border-dashed border-white/10 text-ink-subtle text-sm hover:border-indigo-500/30 hover:text-indigo-400 transition-all"
                            >
                              לחץ כדי לכתוב סיכום לשיעור הזה
                            </button>
                          )}
                        </div>

                        {/* ─── AI Summary ─── */}
                        {lesson.ai_summary && (
                          <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
                            <p className="text-xs font-semibold text-indigo-400 mb-1.5 flex items-center gap-1">
                              <Sparkles size={12} /> סיכום AI
                            </p>
                            <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                              {lesson.ai_summary}
                            </p>
                          </div>
                        )}

                        {/* ─── Actions row ─── */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex gap-2">
                            {!lesson.ai_summary && hasContent && (
                              <button
                                onClick={() => handleSummarize(lesson)}
                                disabled={summarizing === lesson.id}
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                              >
                                {summarizing === lesson.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                {summarizing === lesson.id ? 'מסכם...' : 'סכם עם AI'}
                              </button>
                            )}
                            {course.source_url && (
                              <a href={course.source_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 text-ink-muted hover:text-ink hover:bg-white/8 transition-colors">
                                <ExternalLink size={12} /> Moodle
                              </a>
                            )}
                          </div>
                          <button
                            onClick={() => deleteLesson(lesson.id)}
                            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg text-ink-subtle hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 size={11} /> מחק שיעור
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
