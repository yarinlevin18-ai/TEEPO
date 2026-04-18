'use client'

/**
 * Notebook detail page — the NotebookLM-style workspace.
 *
 * Left pane: sources (upload PDF, paste text, or pick an existing lesson).
 * Right pane: grounded chat. The bot only sees the sources in this notebook,
 * plus the user's course context if the notebook is tied to a course.
 *
 * Quick actions generate summaries, FAQ cards, and study guides from all sources.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Upload, FileText, Type, Trash2, Send, Bot, User, Sparkles,
  Loader2, BookOpen, X, FileQuestion, FileCheck,
  ListOrdered, Eraser, Copy, Check, Plus, Layers,
} from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { useDB } from '@/lib/db-context'
import { useAuth } from '@/lib/auth-context'
import { extractPdfText, PdfExtractionError } from '@/lib/pdf-extract'
import type { ChatMessage, NotebookSource } from '@/types'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
const MAX_RETRIES = 6
const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000, 45000]
const SOCKET_TIMEOUT = 60_000

// How much of each source to ship in the prompt. Claude 200k can eat a lot,
// but we also round-trip through Drive so keep it reasonable.
const MAX_CHARS_PER_SOURCE = 40_000
const MAX_TOTAL_CONTEXT = 120_000

export default function NotebookDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const {
    db, ready, updateNotebook, addNotebookSource, deleteNotebookSource,
    appendNotebookChat, clearNotebookChat,
  } = useDB()

  const notebook = (db.notebooks || []).find((n) => n.id === params.id)
  const sources = (db.notebook_sources || []).filter((s) => s.notebook_id === params.id)
  const course = notebook?.course_id
    ? db.courses.find((c) => c.id === notebook.course_id)
    : null
  const courseLessons = course
    ? db.lessons.filter((l) => l.course_id === course.id).sort((a, b) => a.order_index - b.order_index)
    : []

  // ── Chat state ─────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Source upload state ────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false)
  const [addMode, setAddMode] = useState<'pdf' | 'text' | 'lesson' | 'reuse'>('pdf')
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [reuseQuery, setReuseQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sources from other notebooks — used by the "reuse" tab.
  const reuseCandidates = (db.notebook_sources || []).filter(
    (s) => s.notebook_id !== params.id,
  )
  const reuseFiltered = reuseQuery.trim()
    ? reuseCandidates.filter((s) =>
        s.title.toLowerCase().includes(reuseQuery.toLowerCase()),
      )
    : reuseCandidates

  // ── Edit title state ──────────────────────────────────────
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // Auto-scroll chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notebook?.chat_history?.length, isTyping])

  // ── Socket connection with cold-start resilience ───────────
  useEffect(() => {
    if (!ready || !notebook) return
    let cancelled = false

    const connect = async () => {
      try {
        fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(60_000) }).catch(() => {})
      } catch { }

      if (cancelled) return

      const socket = io(BACKEND, {
        transports: ['polling', 'websocket'],
        timeout: SOCKET_TIMEOUT,
        reconnection: false,
      })
      socketRef.current = socket

      socket.on('connect', () => {
        setConnected(true)
        setIsRetrying(false)
        setRetryCount(0)
        socket.emit('join', {
          user_id: user?.id || 'anonymous',
          agent_type: 'study_buddy',
        })
      })

      socket.on('connect_error', () => {
        setConnected(false)
        if (cancelled) return
        setRetryCount((c) => {
          if (c < MAX_RETRIES) {
            setIsRetrying(true)
            const delay = RETRY_DELAYS[c] ?? 45_000
            retryTimerRef.current = setTimeout(() => {
              if (cancelled) return
              socket.disconnect()
              connect()
            }, delay)
            return c + 1
          }
          setIsRetrying(false)
          return c
        })
      })

      socket.on('disconnect', () => setConnected(false))
      socket.on('typing', () => setIsTyping(true))

      socket.on('reply', async ({ text }: { text: string }) => {
        setIsTyping(false)
        await appendNotebookChat(params.id, {
          role: 'assistant',
          content: text,
          timestamp: new Date().toISOString(),
        })
      })

      socket.on('error', async ({ message }: { message: string }) => {
        setIsTyping(false)
        await appendNotebookChat(params.id, {
          role: 'assistant',
          content: `שגיאה: ${message}`,
          timestamp: new Date().toISOString(),
        })
      })
    }

    connect()
    return () => {
      cancelled = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      socketRef.current?.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, notebook?.id])

  // ── Build grounded context from sources ─────────────────────
  const buildContext = (): string => {
    const parts: string[] = []
    parts.push(
      `המידע להלן הוא המקורות שהמשתמש העלה למחברת "${notebook?.title || ''}". ` +
      `ענה אך ורק על סמך המקורות האלה. אם התשובה לא נמצאת במקורות — אמור זאת בפירוש. ` +
      `בכל תשובה ציין את שם המקור/ים שעליהם התבססת (בסוגריים מרובעים בסוף המשפט, למשל: [מקור: הרצאה 3.pdf]).`,
    )

    if (course) {
      parts.push(`\nהמחברת קשורה לקורס: ${course.title}`)
    }

    let totalChars = parts.join('\n').length

    for (let idx = 0; idx < sources.length; idx++) {
      const s = sources[idx]
      const header = `\n\n━━━ מקור ${idx + 1}: ${s.title} ━━━\n`
      const remaining = MAX_TOTAL_CONTEXT - totalChars - header.length
      if (remaining < 500) {
        parts.push(`\n[...${sources.length - idx} מקורות נוספים הושמטו בשל מגבלת אורך]`)
        break
      }
      const body = s.content.slice(0, Math.min(MAX_CHARS_PER_SOURCE, remaining))
      parts.push(header + body)
      totalChars += header.length + body.length
    }

    return parts.join('')
  }

  // ── Send message ───────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || !socketRef.current || !connected) return

    await appendNotebookChat(params.id, {
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    })

    if (sources.length === 0) {
      await appendNotebookChat(params.id, {
        role: 'assistant',
        content: 'אין עדיין מקורות במחברת — העלה PDF או הדבק טקסט דרך הכפתור "הוסף מקור" בצד, ואז נוכל לדבר.',
        timestamp: new Date().toISOString(),
      })
      setInput('')
      return
    }

    const context = buildContext()
    socketRef.current.emit('message', {
      text: msg,
      agent_type: 'study_buddy',
      context,
      course_id: course?.id || '',
      // Grounded-mode signal: backend skips DDG and swaps system prompt
      // so the bot answers strictly from the sources we ship in `context`.
      mode: 'notebook',
    })
    if (!text) setInput('')
  }

  // ── Quick actions ──────────────────────────────────────────
  const QUICK_ACTIONS: { label: string; icon: any; prompt: string }[] = [
    {
      label: 'סיכום כללי',
      icon: FileCheck,
      prompt: 'סכם את כל המקורות במחברת הזו. תן נקודות עיקריות מאורגנות לפי נושאים, ואת המסקנות המרכזיות.',
    },
    {
      label: 'שאלות נפוצות',
      icon: FileQuestion,
      prompt: 'צור 10 שאלות ותשובות מהחומר. השאלות צריכות לכסות את הנושאים החשובים ביותר. כל תשובה קצרה וברורה, עם ציטוט למקור.',
    },
    {
      label: 'מדריך לבחינה',
      icon: ListOrdered,
      prompt: 'צור מדריך לימוד מסודר לבחינה על סמך החומר. כלול: (1) מושגי מפתח, (2) נוסחאות/עקרונות שחשוב לזכור, (3) סוגי שאלות נפוצים, (4) טיפים לפתרון.',
    },
    {
      label: 'מה לא ברור?',
      icon: Sparkles,
      prompt: 'זהה את הנקודות הקשות והלא-ברורות בחומר, והסבר כל אחת בפירוט ובדוגמה קונקרטית.',
    },
  ]

  // ── File upload ────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    setUploadProgress(`קורא את ${file.name}...`)
    try {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('כרגע תומכים רק ב-PDF. לטקסט אחר — הדבק כטקסט.')
      }
      const extracted = await extractPdfText(file)
      await addNotebookSource(params.id, {
        type: 'pdf',
        title: file.name.replace(/\.pdf$/i, ''),
        content: extracted.text,
        file_name: file.name,
        meta: {
          pages: extracted.pages,
          words: extracted.text.split(/\s+/).length,
        },
      })
      setUploadProgress(
        `נקלט ${file.name} (${extracted.pages} עמודים${extracted.truncated ? ', קוצץ בגלל גודל' : ''})`,
      )
      setTimeout(() => {
        setUploading(false)
        setUploadProgress('')
        setShowAddModal(false)
      }, 1200)
    } catch (e: any) {
      // PdfExtractionError carries kind-specific Hebrew messages already.
      // For anything else, fall back to the generic error text.
      const msg = e instanceof PdfExtractionError
        ? e.message
        : (e?.message || 'נכשל בקריאת הקובץ')
      setUploadProgress(`שגיאה: ${msg}`)
      setTimeout(() => {
        setUploading(false)
        setUploadProgress('')
      }, 4000)
    }
  }

  const handleAddText = async () => {
    if (!textTitle.trim() || !textContent.trim()) return
    setUploading(true)
    await addNotebookSource(params.id, {
      type: 'text',
      title: textTitle.trim(),
      content: textContent.trim(),
      meta: { words: textContent.trim().split(/\s+/).length },
    })
    setTextTitle('')
    setTextContent('')
    setUploading(false)
    setShowAddModal(false)
  }

  const handleReuseSource = async (sourceId: string) => {
    const src = (db.notebook_sources || []).find((s) => s.id === sourceId)
    if (!src) return
    setUploading(true)
    // Clone the content (by value) into this notebook. We intentionally
    // don't share IDs — deleting the source here must not affect the
    // original notebook's copy.
    await addNotebookSource(params.id, {
      type: src.type,
      title: src.title,
      content: src.content,
      file_name: src.file_name,
      url: src.url,
      lesson_id: src.lesson_id,
      meta: src.meta,
    })
    setUploading(false)
    setShowAddModal(false)
  }

  const handleAddLesson = async (lessonId: string) => {
    const lesson = db.lessons.find((l) => l.id === lessonId)
    if (!lesson) return
    setUploading(true)
    const content = [
      lesson.ai_summary ? `סיכום AI:\n${lesson.ai_summary}` : '',
      lesson.content ? `תוכן:\n${lesson.content}` : '',
    ].filter(Boolean).join('\n\n') || lesson.title
    await addNotebookSource(params.id, {
      type: 'lesson_ref',
      title: lesson.title,
      content,
      lesson_id: lesson.id,
      meta: { words: content.split(/\s+/).length },
    })
    setUploading(false)
    setShowAddModal(false)
  }

  const handleSaveTitle = async () => {
    if (!titleDraft.trim() || !notebook) return
    await updateNotebook(notebook.id, { title: titleDraft.trim() })
    setEditingTitle(false)
  }

  // ── Render guards ──────────────────────────────────────────
  if (!ready) {
    return <div className="p-8 text-center text-ink-muted">טוען...</div>
  }
  if (!notebook) {
    return (
      <div className="p-8 text-center">
        <p className="text-ink-muted mb-4">המחברת לא נמצאה.</p>
        <Link href="/notebooks" className="text-indigo-400 hover:underline">
          חזרה לרשימת המחברות
        </Link>
      </div>
    )
  }

  const messages = notebook.chat_history || []
  const totalChars = sources.reduce((sum, s) => sum + s.content.length, 0)
  const totalWords = sources.reduce((sum, s) => sum + (s.meta?.words || 0), 0)

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col" style={{ direction: 'rtl' }}>
      {/* Header */}
      <div className="px-4 md:px-6 py-3 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => router.push('/notebooks')}
          className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5"
        >
          <ArrowRight size={18} />
        </button>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <Layers size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="text-lg font-semibold bg-white/5 border border-white/10 rounded-lg px-2 py-1 outline-none w-full"
            />
          ) : (
            <h1
              className="text-lg md:text-xl font-semibold truncate cursor-text hover:text-indigo-400 transition-colors"
              onClick={() => {
                setTitleDraft(notebook.title)
                setEditingTitle(true)
              }}
              title="לחץ לעריכה"
            >
              {notebook.title}
            </h1>
          )}
          <div className="flex items-center gap-3 text-[11px] text-ink-muted">
            <span>{sources.length} מקורות</span>
            <span>·</span>
            <span>{totalWords.toLocaleString()} מילים</span>
            {course && (
              <>
                <span>·</span>
                <span className="text-indigo-400 flex items-center gap-1">
                  <BookOpen size={10} /> {course.title}
                </span>
              </>
            )}
            <span>·</span>
            <span className={connected ? 'text-green-400' : isRetrying ? 'text-amber-400' : 'text-ink-muted'}>
              {connected ? 'מחובר' : isRetrying ? `מעיר שרת... (${retryCount}/${MAX_RETRIES})` : 'לא מחובר'}
            </span>
          </div>
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sources pane */}
        <aside className="lg:w-80 xl:w-96 border-b lg:border-b-0 lg:border-l border-white/5 flex flex-col flex-shrink-0 max-h-60 lg:max-h-none">
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText size={14} className="text-indigo-400" />
              מקורות
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs px-2 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 flex items-center gap-1"
            >
              <Plus size={12} /> הוסף
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {sources.length === 0 ? (
              <div className="text-center py-8 text-ink-muted text-xs">
                אין מקורות עדיין.
                <br />
                לחץ "הוסף" כדי להעלות PDF או להדביק טקסט.
              </div>
            ) : (
              sources.map((s) => <SourceCard key={s.id} source={s} onDelete={deleteNotebookSource} />)
            )}
          </div>
        </aside>

        {/* Chat pane */}
        <section className="flex-1 flex flex-col min-w-0">
          {/* Quick actions */}
          {sources.length > 0 && messages.length === 0 && (
            <div className="px-4 pt-4 pb-2">
              <div className="text-xs text-ink-muted mb-2">פעולות מהירות:</div>
              <div className="flex gap-2 flex-wrap">
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon
                  return (
                    <button
                      key={a.label}
                      onClick={() => sendMessage(a.prompt)}
                      disabled={!connected}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    >
                      <Icon size={12} className="text-indigo-400" />
                      {a.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && sources.length === 0 && (
              <div className="text-center py-16">
                <div
                  className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                  <Upload size={28} className="text-white" />
                </div>
                <h2 className="text-lg font-semibold mb-2">מתחילים</h2>
                <p className="text-ink-muted text-sm max-w-md mx-auto">
                  העלה את המקור הראשון (PDF או טקסט) — ואז תוכל לשאול את הבוט שאלות על החומר.
                  הוא יענה רק ממה שהעלית.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 px-4 py-2 rounded-xl text-white font-medium inline-flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                  <Plus size={16} /> הוסף מקור ראשון
                </button>
              </div>
            )}

            {messages.length === 0 && sources.length > 0 && (
              <div className="text-center py-10 text-ink-muted text-sm">
                שאל את הבוט כל שאלה על המקורות — או לחץ על אחת מפעולות מהירות למעלה.
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
            </AnimatePresence>

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
                  <Bot size={14} className="text-indigo-400" />
                </div>
                <div className="px-3 py-2 rounded-2xl flex gap-1.5 items-center bg-white/5 border border-white/5">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Chat toolbar */}
          {messages.length > 0 && (
            <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={async () => {
                  if (confirm('לנקות את השיחה? המקורות יישארו.')) {
                    await clearNotebookChat(params.id)
                  }
                }}
                className="text-[11px] text-ink-muted hover:text-red-400 flex items-center gap-1"
              >
                <Eraser size={12} /> נקה שיחה
              </button>
              <span className="text-[11px] text-ink-muted">{messages.length} הודעות</span>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-white/5">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder={sources.length === 0 ? 'העלה מקור קודם...' : 'שאל על החומר...'}
                rows={1}
                disabled={!connected || sources.length === 0}
                className="flex-1 resize-none max-h-32 text-sm rounded-xl px-3 py-2.5 disabled:opacity-50"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#f1f5f9',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || !connected || sources.length === 0}
                className="px-3 py-2.5 rounded-xl text-white disabled:opacity-30 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Add source modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => !uploading && setShowAddModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto"
            style={{ direction: 'rtl' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">הוסף מקור</h3>
              {!uploading && (
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-ink-muted hover:text-ink"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl bg-white/5">
              {[
                { id: 'pdf' as const, label: 'PDF', icon: FileText },
                { id: 'text' as const, label: 'טקסט', icon: Type },
                { id: 'lesson' as const, label: 'שיעור', icon: BookOpen, disabled: courseLessons.length === 0 },
                { id: 'reuse' as const, label: 'מחברת אחרת', icon: Layers, disabled: reuseCandidates.length === 0 },
              ].map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => setAddMode(t.id)}
                    disabled={t.disabled}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors ${
                      addMode === t.id
                        ? 'bg-white/10 text-ink'
                        : 'text-ink-muted hover:text-ink'
                    } disabled:opacity-30`}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                )
              })}
            </div>

            {/* PDF upload */}
            {addMode === 'pdf' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileUpload(f)
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-white/10 rounded-xl p-8 hover:border-indigo-400/50 hover:bg-indigo-500/5 transition-all flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 size={28} className="text-indigo-400 animate-spin" />
                  ) : (
                    <Upload size={28} className="text-indigo-400" />
                  )}
                  <span className="text-sm font-medium">
                    {uploading ? uploadProgress : 'לחץ להעלאת PDF'}
                  </span>
                  <span className="text-xs text-ink-muted">
                    הקובץ מעובד בדפדפן — לא עולה לשרת
                  </span>
                </button>
              </div>
            )}

            {/* Text paste */}
            {addMode === 'text' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="כותרת (למשל: סיכום של הרצאה 3)"
                  className="w-full text-sm rounded-xl px-3 py-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f1f5f9',
                    outline: 'none',
                  }}
                />
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="הדבק את הטקסט כאן..."
                  rows={10}
                  className="w-full text-sm rounded-xl px-3 py-2.5 resize-y"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f1f5f9',
                    outline: 'none',
                  }}
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-ink-muted">
                    {textContent.length.toLocaleString()} תווים
                  </span>
                  <button
                    onClick={handleAddText}
                    disabled={!textTitle.trim() || !textContent.trim() || uploading}
                    className="px-4 py-2 text-sm rounded-xl text-white font-medium disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  >
                    הוסף
                  </button>
                </div>
              </div>
            )}

            {/* Re-use source from another notebook */}
            {addMode === 'reuse' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={reuseQuery}
                  onChange={(e) => setReuseQuery(e.target.value)}
                  placeholder="חפש לפי שם..."
                  className="w-full text-sm rounded-xl px-3 py-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f1f5f9',
                    outline: 'none',
                  }}
                />
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {reuseFiltered.length === 0 ? (
                    <div className="text-center py-8 text-ink-muted text-sm">
                      {reuseCandidates.length === 0
                        ? 'אין מקורות במחברות אחרות עדיין.'
                        : 'לא נמצאו מקורות שמתאימים לחיפוש.'}
                    </div>
                  ) : (
                    reuseFiltered.map((s) => {
                      const origin = (db.notebooks || []).find((n) => n.id === s.notebook_id)
                      const alreadyAdded = sources.some(
                        (x) => x.title === s.title && x.content === s.content,
                      )
                      const SIcon = s.type === 'pdf' ? FileText
                        : s.type === 'text' ? Type
                        : s.type === 'lesson_ref' ? BookOpen
                        : FileText
                      return (
                        <button
                          key={s.id}
                          onClick={() => !alreadyAdded && handleReuseSource(s.id)}
                          disabled={alreadyAdded || uploading}
                          className={`w-full text-right p-3 rounded-xl border transition-colors flex items-start gap-2 ${
                            alreadyAdded
                              ? 'bg-emerald-500/5 border-emerald-500/20 opacity-60'
                              : 'bg-white/5 border-white/8 hover:bg-white/10 hover:border-indigo-400/30'
                          }`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                            <SIcon size={13} className="text-indigo-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate flex items-center gap-1">
                              {alreadyAdded && <Check size={12} className="text-emerald-400" />}
                              {s.title}
                            </div>
                            <div className="text-[11px] text-ink-muted flex items-center gap-2 mt-0.5">
                              {origin && (
                                <span className="flex items-center gap-1 truncate">
                                  <Layers size={10} /> {origin.title}
                                </span>
                              )}
                              {s.meta?.pages && <span>· {s.meta.pages} עמ׳</span>}
                              {s.meta?.words && <span>· {s.meta.words.toLocaleString()} מילים</span>}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* Lesson picker */}
            {addMode === 'lesson' && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {courseLessons.length === 0 ? (
                  <div className="text-center py-8 text-ink-muted text-sm">
                    המחברת לא משויכת לקורס, או שאין שיעורים בקורס.
                  </div>
                ) : (
                  courseLessons.map((l) => {
                    const alreadyAdded = sources.some((s) => s.lesson_id === l.id)
                    return (
                      <button
                        key={l.id}
                        onClick={() => !alreadyAdded && handleAddLesson(l.id)}
                        disabled={alreadyAdded || uploading}
                        className={`w-full text-right p-3 rounded-xl border transition-colors ${
                          alreadyAdded
                            ? 'bg-emerald-500/5 border-emerald-500/20 opacity-60'
                            : 'bg-white/5 border-white/8 hover:bg-white/10 hover:border-indigo-400/30'
                        }`}
                      >
                        <div className="text-sm font-medium flex items-center gap-2">
                          {alreadyAdded && <Check size={12} className="text-emerald-400" />}
                          {l.title}
                        </div>
                        {l.ai_summary && (
                          <div className="text-xs text-ink-muted line-clamp-1 mt-1">
                            {l.ai_summary}
                          </div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────

function SourceCard({
  source,
  onDelete,
}: {
  source: NotebookSource
  onDelete: (id: string) => Promise<void>
}) {
  const Icon = source.type === 'pdf'
    ? FileText
    : source.type === 'text'
    ? Type
    : source.type === 'lesson_ref'
    ? BookOpen
    : FileText

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 rounded-xl bg-white/4 border border-white/5 hover:border-indigo-400/20 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
          <Icon size={13} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" title={source.title}>
            {source.title}
          </div>
          <div className="text-[10px] text-ink-muted mt-0.5">
            {source.meta?.pages && `${source.meta.pages} עמ׳ · `}
            {source.meta?.words
              ? `${source.meta.words.toLocaleString()} מילים`
              : `${source.content.length.toLocaleString()} תווים`}
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm(`למחוק את "${source.title}"?`)) onDelete(source.id)
          }}
          className="p-1 rounded text-ink-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="מחק"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
          isUser
            ? 'bg-gradient-to-br from-indigo-500 to-violet-500'
            : 'bg-white/5 border border-white/8'
        }`}
      >
        {isUser ? (
          <User size={13} className="text-white" />
        ) : (
          <Bot size={13} className="text-indigo-400" />
        )}
      </div>

      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap group relative ${
          isUser ? 'text-white rounded-tr-sm' : 'text-ink rounded-tl-sm'
        }`}
        style={
          isUser
            ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
        }
      >
        {msg.content}
        {!isUser && (
          <button
            onClick={handleCopy}
            className="absolute -bottom-2 left-2 p-1 rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
            title="העתק"
          >
            {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
          </button>
        )}
      </div>
    </motion.div>
  )
}
