'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ExternalLink, ArrowRight, CheckCircle2,
  FileText, Sparkles, Loader2, ChevronDown, Plus,
  PenLine, Upload, Trash2, Save, X, Clock,
  StickyNote, Wand2, FileUp, Edit3, Link2,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api-client'

// Load rich editor only client-side (TipTap uses browser APIs)
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { Course, Lesson, CourseNote } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

interface CourseDetail extends Course {
  lessons: Lesson[]
}

type Tab = 'lessons' | 'notes'

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.id as string

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [notes, setNotes] = useState<CourseNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('notes')
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState<string | null>(null)

  // Note editor state
  const [showEditor, setShowEditor] = useState(false)
  const [editingNote, setEditingNote] = useState<CourseNote | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [summarizingContent, setSummarizingContent] = useState(false)

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Google Docs import
  const [showGDocsModal, setShowGDocsModal] = useState(false)
  const [gdocsUrl, setGdocsUrl] = useState('')
  const [fetchingGDoc, setFetchingGDoc] = useState(false)

  useEffect(() => {
    if (!courseId) return
    const load = async () => {
      try {
        const [courseData, notesData] = await Promise.all([
          api.courses.get(courseId),
          api.notes.list(courseId),
        ])
        setCourse(courseData)
        setNotes(notesData)
      } catch (e: any) {
        console.error(e)
        setError('שגיאה בטעינת הקורס.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseId])

  // ── Lesson AI summary ──
  const handleSummarize = async (lesson: Lesson) => {
    if (!lesson.content && !lesson.title) return
    setSummarizing(lesson.id)
    try {
      const result = await api.lessons.summarize(
        lesson.content || lesson.title,
        lesson.title
      )
      setCourse((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          lessons: prev.lessons.map((l) =>
            l.id === lesson.id
              ? { ...l, ai_summary: result.result || result.summary || result.answer }
              : l
          ),
        }
      })
    } catch (e: any) {
      console.error(e)
      setError('שגיאה ביצירת סיכום.')
    } finally {
      setSummarizing(null)
    }
  }

  // ── Notes CRUD ──
  const openNewNote = () => {
    setEditingNote(null)
    setNoteTitle('')
    setNoteContent('')
    setShowEditor(true)
  }

  const openEditNote = (note: CourseNote) => {
    setEditingNote(note)
    setNoteTitle(note.title)
    setNoteContent(note.content)
    setShowEditor(true)
  }

  const closeEditor = () => {
    setShowEditor(false)
    setEditingNote(null)
    setNoteTitle('')
    setNoteContent('')
  }

  const saveNote = async () => {
    if (!noteContent.trim() && !noteTitle.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (editingNote) {
        const updated = await api.notes.update(courseId, editingNote.id, {
          title: noteTitle,
          content: noteContent,
        })
        setNotes((prev) => prev.map((n) => n.id === editingNote.id ? { ...n, ...updated } : n))
      } else {
        const created = await api.notes.create(courseId, {
          title: noteTitle,
          content: noteContent,
          note_type: 'manual',
        })
        setNotes((prev) => [created, ...prev])
      }
      closeEditor()
    } catch (e: any) {
      console.error(e)
      setError('שגיאה בשמירת ההערה.')
    } finally {
      setSaving(false)
    }
  }

  const deleteNote = async (noteId: string) => {
    const prev = notes
    setNotes((n) => n.filter((note) => note.id !== noteId))
    try {
      await api.notes.delete(courseId, noteId)
    } catch (e: any) {
      console.error(e)
      setNotes(prev)
      setError('שגיאה במחיקת ההערה.')
    }
  }

  // ── File upload → read text → AI summarize ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Read text content from file
    const text = await file.text()
    if (!text.trim()) {
      setError('הקובץ ריק או שלא ניתן לקרוא אותו.')
      return
    }

    setSummarizingContent(true)
    setError(null)
    try {
      const note = await api.notes.summarize(
        courseId,
        text,
        file.name.replace(/\.[^.]+$/, ''),
        file.name
      )
      setNotes((prev) => [note, ...prev])
      setActiveTab('notes')
    } catch (e: any) {
      console.error(e)
      setError('שגיאה בסיכום הקובץ.')
    } finally {
      setSummarizingContent(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Paste content → AI summarize ──
  const handleAISummarize = async () => {
    if (!noteContent.trim()) {
      setError('הדבק תוכן בעורך כדי ליצור סיכום AI.')
      return
    }
    setSummarizingContent(true)
    setError(null)
    try {
      const note = await api.notes.summarize(
        courseId,
        noteContent,
        noteTitle || 'סיכום'
      )
      setNotes((prev) => [note, ...prev])
      closeEditor()
    } catch (e: any) {
      console.error(e)
      setError('שגיאה ביצירת הסיכום.')
    } finally {
      setSummarizingContent(false)
    }
  }

  // ── Google Docs import ──
  const handleGDocsImport = async () => {
    if (!gdocsUrl.trim()) return
    setFetchingGDoc(true)
    setError(null)
    try {
      // Step 1: Fetch the doc content
      const doc = await api.gdocs.fetch(gdocsUrl)

      // Step 2: AI summarize and save as note
      const note = await api.notes.summarize(
        courseId,
        doc.content,
        doc.title,
        'Google Docs'
      )

      // Also save the raw content as a separate note
      const rawNote = await api.notes.create(courseId, {
        title: doc.title,
        content: doc.content,
        note_type: 'file_upload',
        file_name: 'Google Docs',
      })

      setNotes((prev) => [note, rawNote, ...prev])
      setShowGDocsModal(false)
      setGdocsUrl('')
      setActiveTab('notes')
    } catch (e: any) {
      console.error(e)
      setError(e.message || 'שגיאה בייבוא מ-Google Docs.')
    } finally {
      setFetchingGDoc(false)
    }
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="h-8 w-64 shimmer rounded-lg" />
        <div className="h-4 w-48 shimmer rounded-lg" />
        <div className="space-y-3 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 shimmer rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-fade-in">
        <ErrorAlert message={error || 'הקורס לא נמצא'} />
        <Link href="/courses" className="mt-4 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors">
          <ArrowRight size={14} /> חזרה לקורסים
        </Link>
      </div>
    )
  }

  const completedLessons = course.lessons.filter((l) => l.is_completed).length
  const progress = course.lessons.length > 0
    ? Math.round((completedLessons / course.lessons.length) * 100)
    : 0

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Back link */}
      <Link href="/courses" className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors">
        <ArrowRight size={14} /> חזרה לקורסים
      </Link>

      {/* Course header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={24} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink">{course.title}</h1>
            {course.description && (
              <p className="text-sm text-ink-muted mt-1 line-clamp-2">{course.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                course.source === 'bgu'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}>
                {course.source === 'bgu' ? 'BGU Moodle' : course.source}
              </span>
              {course.source_url && (
                <a
                  href={course.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors"
                >
                  <ExternalLink size={12} /> פתח ב-Moodle
                </a>
              )}
              <span className="text-xs text-ink-muted">
                {course.lessons.length} שיעורים · {notes.length} סיכומים
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {course.lessons.length > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-ink-muted mb-2">
              <span>התקדמות בקורס</span>
              <span>{completedLessons}/{course.lessons.length} ({progress}%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 glass rounded-xl p-1">
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'notes'
              ? 'bg-indigo-500/15 text-indigo-400 shadow-sm'
              : 'text-ink-muted hover:text-ink hover:bg-white/[0.03]'
          }`}
        >
          <StickyNote size={16} />
          סיכומים והערות
          {notes.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">
              {notes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('lessons')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'lessons'
              ? 'bg-indigo-500/15 text-indigo-400 shadow-sm'
              : 'text-ink-muted hover:text-ink hover:bg-white/[0.03]'
          }`}
        >
          <FileText size={16} />
          שיעורים
          {course.lessons.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-ink-muted">
              {course.lessons.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/*  NOTES TAB                                      */}
      {/* ═══════════════════════════════════════════════ */}
      {activeTab === 'notes' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Actions bar */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openNewNote}
              className="btn-gradient px-4 py-2.5 rounded-xl text-sm text-white font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              <PenLine size={15} />
              כתוב סיכום
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={summarizingContent}
              className="glass px-4 py-2.5 rounded-xl text-sm text-ink font-medium flex items-center gap-2 hover:bg-white/[0.08] transition-all disabled:opacity-50"
            >
              {summarizingContent ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              {summarizingContent ? 'מסכם...' : 'העלה קובץ וסכם'}
            </button>
            <button
              onClick={() => setShowGDocsModal(true)}
              className="glass px-4 py-2.5 rounded-xl text-sm text-ink font-medium flex items-center gap-2 hover:bg-white/[0.08] transition-all"
            >
              <Link2 size={15} className="text-blue-400" />
              ייבוא מ-Google Docs
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.html,.xml,.rtf"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Note editor */}
          <AnimatePresence>
            {showEditor && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="glass rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                      <Edit3 size={14} className="text-indigo-400" />
                      {editingNote ? 'ערוך סיכום' : 'סיכום חדש'}
                    </h3>
                    <button onClick={closeEditor} className="p-1.5 text-ink-muted hover:text-ink transition-colors">
                      <X size={16} />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="כותרת (אופציונלי)..."
                    className="input-dark w-full text-sm"
                  />

                  <RichTextEditor
                    content={noteContent}
                    onChange={setNoteContent}
                    placeholder="כתוב את הסיכום שלך כאן, או הדבק תוכן מהרצאה..."
                  />

                  <div className="flex items-center gap-2 justify-between">
                    <button
                      onClick={handleAISummarize}
                      disabled={summarizingContent || !noteContent.trim()}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                    >
                      {summarizingContent ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Wand2 size={12} />
                      )}
                      {summarizingContent ? 'מסכם עם AI...' : 'סכם עם AI'}
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={closeEditor}
                        className="px-4 py-2 text-ink-muted hover:text-ink text-sm transition-colors rounded-lg"
                      >
                        ביטול
                      </button>
                      <button
                        onClick={saveNote}
                        disabled={saving || (!noteContent.trim() && !noteTitle.trim())}
                        className="btn-gradient px-5 py-2 rounded-lg text-sm text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {saving ? 'שומר...' : 'שמור'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Notes list */}
          {notes.length === 0 && !showEditor ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-10 text-center relative overflow-hidden"
            >
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-6 right-10 w-20 h-20 rounded-full bg-indigo-500/10 blur-2xl" />
                <div className="absolute bottom-8 left-12 w-16 h-16 rounded-full bg-violet-500/10 blur-2xl" />
              </div>
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                  <StickyNote size={28} className="text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-ink mb-1">אין סיכומים עדיין</h3>
                <p className="text-sm text-ink-muted mb-5 max-w-sm mx-auto">
                  כתוב סיכום משלך, העלה קובץ טקסט לסיכום אוטומטי, או הדבק תוכן מהרצאה.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={openNewNote}
                    className="btn-gradient px-4 py-2.5 rounded-xl text-sm text-white font-medium inline-flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                  >
                    <PenLine size={15} />
                    כתוב סיכום
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="glass px-4 py-2.5 rounded-xl text-sm text-ink font-medium inline-flex items-center gap-2 hover:bg-white/[0.08] transition-all"
                  >
                    <Upload size={15} />
                    העלה קובץ
                  </button>
                  <button
                    onClick={() => setShowGDocsModal(true)}
                    className="glass px-4 py-2.5 rounded-xl text-sm text-ink font-medium inline-flex items-center gap-2 hover:bg-white/[0.08] transition-all"
                  >
                    <Link2 size={15} className="text-blue-400" />
                    Google Docs
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {notes.map((note, i) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass rounded-xl overflow-hidden group"
                  >
                    <div className="p-4">
                      {/* Note header */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            note.note_type === 'ai_generated'
                              ? 'bg-violet-500/15'
                              : note.note_type === 'file_upload'
                                ? 'bg-amber-500/15'
                                : 'bg-indigo-500/15'
                          }`}>
                            {note.note_type === 'ai_generated' ? (
                              <Sparkles size={14} className="text-violet-400" />
                            ) : note.note_type === 'file_upload' ? (
                              <FileUp size={14} className="text-amber-400" />
                            ) : (
                              <PenLine size={14} className="text-indigo-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-medium text-ink truncate">
                              {note.title || 'ללא כותרת'}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-ink-subtle flex items-center gap-1">
                                <Clock size={9} />
                                {format(new Date(note.updated_at || note.created_at), 'd בMMM yyyy, HH:mm', { locale: he })}
                              </span>
                              {note.file_name && (
                                <span className="text-[10px] text-amber-400/70">
                                  {note.file_name}
                                </span>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                note.note_type === 'ai_generated'
                                  ? 'bg-violet-500/10 text-violet-400'
                                  : note.note_type === 'file_upload'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-white/5 text-ink-subtle'
                              }`}>
                                {note.note_type === 'ai_generated' ? 'AI' : note.note_type === 'file_upload' ? 'קובץ' : 'ידני'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditNote(note)}
                            className="p-1.5 rounded-lg text-ink-muted hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="p-1.5 rounded-lg text-ink-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Note content — rendered as rich HTML */}
                      <div
                        className="note-display line-clamp-6 pr-10"
                        dangerouslySetInnerHTML={{ __html: note.content }}
                      />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

      {/* Google Docs import modal */}
      <AnimatePresence>
        {showGDocsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowGDocsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl p-6 w-full max-w-md space-y-4"
              style={{ background: 'rgba(22,27,39,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <Link2 size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">ייבוא מ-Google Docs</h3>
                  <p className="text-xs text-ink-muted">הדבק קישור למסמך ציבורי</p>
                </div>
              </div>

              <div className="space-y-2">
                <input
                  autoFocus
                  type="url"
                  value={gdocsUrl}
                  onChange={(e) => setGdocsUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGDocsImport() }}
                  placeholder="https://docs.google.com/document/d/..."
                  className="input-dark w-full text-sm"
                  dir="ltr"
                />
                <p className="text-[10px] text-ink-subtle leading-relaxed">
                  ודא שהמסמך משותף עם &quot;כל מי שיש לו את הקישור יכול לצפות&quot;.
                  התוכן ייובא ויסוכם אוטומטית עם AI.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowGDocsModal(false)}
                  className="px-4 py-2 text-ink-muted hover:text-ink text-sm transition-colors rounded-lg"
                >
                  ביטול
                </button>
                <button
                  onClick={handleGDocsImport}
                  disabled={fetchingGDoc || !gdocsUrl.trim()}
                  className="btn-gradient px-5 py-2 rounded-lg text-sm text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {fetchingGDoc ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {fetchingGDoc ? 'מייבא ומסכם...' : 'ייבא וסכם'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════ */}
      {/*  LESSONS TAB                                    */}
      {/* ═══════════════════════════════════════════════ */}
      {activeTab === 'lessons' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          {course.lessons.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <FileText size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-ink-muted text-sm">אין שיעורים בקורס זה</p>
              {course.source === 'bgu' && course.source_url && (
                <a
                  href={course.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-400 hover:text-accent-300 transition-colors"
                >
                  <ExternalLink size={14} /> צפה בתוכן ב-Moodle
                </a>
              )}
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden divide-y divide-white/5">
              {course.lessons.map((lesson, index) => (
                <div key={lesson.id}>
                  <button
                    onClick={() =>
                      setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)
                    }
                    className="w-full flex items-center gap-3 p-4 text-right hover:bg-white/[0.03] transition-colors"
                  >
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        const newVal = !lesson.is_completed
                        setCourse((prev) => prev ? {
                          ...prev,
                          lessons: prev.lessons.map((l) =>
                            l.id === lesson.id ? { ...l, is_completed: newVal } : l
                          ),
                        } : prev)
                        api.lessons.update(lesson.id, { is_completed: newVal }).catch(() => {
                          setCourse((prev) => prev ? {
                            ...prev,
                            lessons: prev.lessons.map((l) =>
                              l.id === lesson.id ? { ...l, is_completed: !newVal } : l
                            ),
                          } : prev)
                        })
                      }}
                      className={`w-7 h-7 rounded-full text-xs flex items-center justify-center flex-shrink-0 font-medium cursor-pointer transition-all hover:scale-110 ${
                        lesson.is_completed
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                          : 'bg-white/5 text-ink-muted hover:bg-indigo-500/15 hover:text-indigo-400'
                      }`}
                      title={lesson.is_completed ? 'סמן כלא הושלם' : 'סמן כהושלם'}
                    >
                      {lesson.is_completed ? <CheckCircle2 size={14} /> : index + 1}
                    </span>

                    <span className={`text-sm flex-1 text-right ${
                      lesson.is_completed ? 'text-ink-muted line-through' : 'text-ink'
                    }`}>
                      {lesson.title}
                    </span>

                    {lesson.duration_minutes && (
                      <span className="text-xs text-ink-subtle flex-shrink-0">
                        {lesson.duration_minutes} דק׳
                      </span>
                    )}

                    <ChevronDown
                      size={14}
                      className={`text-ink-subtle transition-transform flex-shrink-0 ${
                        expandedLesson === lesson.id ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {expandedLesson === lesson.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pr-14 space-y-3">
                          {lesson.content && (
                            <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap line-clamp-6">
                              {lesson.content}
                            </p>
                          )}

                          {lesson.ai_summary && (
                            <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                              <p className="text-xs font-semibold text-indigo-400 mb-1 flex items-center gap-1">
                                <Sparkles size={12} /> סיכום AI
                              </p>
                              <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                                {lesson.ai_summary}
                              </p>
                            </div>
                          )}

                          <div className="flex gap-2">
                            {!lesson.ai_summary && (
                              <button
                                onClick={() => handleSummarize(lesson)}
                                disabled={summarizing === lesson.id}
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                              >
                                {summarizing === lesson.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Sparkles size={12} />
                                )}
                                {summarizing === lesson.id ? 'מסכם...' : 'סכם עם AI'}
                              </button>
                            )}
                            {course.source_url && (
                              <a
                                href={course.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 text-ink-muted hover:text-ink hover:bg-white/8 transition-colors"
                              >
                                <ExternalLink size={12} /> Moodle
                              </a>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
