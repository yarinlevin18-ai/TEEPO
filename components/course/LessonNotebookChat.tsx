'use client'

/**
 * NotebookLM-style AI chat, scoped to a single lesson.
 *
 * Differences from the course-level AIChat:
 *  - Emits `mode: "notebook"` so the backend runs grounded Q&A (no web
 *    search, no inventing, answers only from the provided context).
 *  - Builds `context` from the lesson itself — title, user summary,
 *    ai_summary, and the names of attached files. The backend accepts
 *    up to 150KB, so we can stuff plenty in.
 *
 * Until we parse the lesson's actual files server-side, the AI "knows"
 * whatever the user has written (content + ai_summary) and the names of
 * the attached files. This mirrors NotebookLM's grounded behavior.
 */

import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { motion } from 'framer-motion'
import { Send, Sparkles, Paperclip, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import type { Lesson, ChatMessage } from '@/types'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

/**
 * Strip HTML tags for the context string we ship to the model — Claude
 * does better with plain text than with the raw TipTap HTML.
 */
function htmlToPlain(html: string): string {
  if (!html) return ''
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Assemble the "sources" blob we send as `context` on every question. */
function buildLessonContext(lesson: Lesson, courseTitle: string): string {
  const parts: string[] = []

  parts.push(`קורס: ${courseTitle}`)
  parts.push(`שיעור: ${lesson.title}`)

  const notes = htmlToPlain(lesson.content || '')
  if (notes) {
    parts.push(`\n--- סיכום המשתמש ---\n${notes}`)
  }

  if (lesson.ai_summary) {
    parts.push(`\n--- סיכום AI קודם ---\n${lesson.ai_summary}`)
  }

  const files = lesson.files || []
  if (files.length > 0) {
    const list = files
      .map((f, i) => `${i + 1}. ${f.name} (${f.type}${f.url ? ` · ${f.url}` : ''})`)
      .join('\n')
    parts.push(`\n--- קבצים מצורפים ---\n${list}\n(שים לב: תוכן הקבצים אינו זמין כרגע — ענה לפי מה שהמשתמש כתב וציין שאין לך גישה לתוכן הקובץ עצמו.)`)
  }

  return parts.join('\n')
}

interface Props {
  lesson: Lesson
  courseId: string
  courseTitle: string
}

export default function LessonNotebookChat({ lesson, courseId, courseTitle }: Props) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Socket wiring ────────────────────────────────────────
  useEffect(() => {
    const socket = io(BACKEND, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join', {
        user_id: user?.id || 'anonymous',
        agent_type: 'study_buddy',
      })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connected', () => {
      setMessages([{
        role: 'assistant',
        content: `אני המחברת של השיעור "${lesson.title}". אני עונה רק על סמך הסיכום שלך והקבצים שצירפת — בלי להמציא. שאל אותי על החומר.`,
      }])
    })
    socket.on('typing', () => setTyping(true))
    socket.on('reply', ({ text }: { text: string }) => {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: text }])
    })
    socket.on('error', ({ message }: { message: string }) => {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${message}` }])
    })

    return () => { socket.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const send = () => {
    const text = input.trim()
    if (!text || !socketRef.current) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    socketRef.current.emit('message', {
      text,
      mode: 'notebook',
      agent_type: 'study_buddy',
      course_id: courseId,
      context: buildLessonContext(lesson, courseTitle),
    })
    setInput('')
    setTyping(true)
  }

  const hasSources = !!(
    (lesson.content && htmlToPlain(lesson.content)) ||
    lesson.ai_summary ||
    (lesson.files && lesson.files.length > 0)
  )

  return (
    <div className="glass rounded-2xl flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
          <Sparkles size={14} className="text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink">מחברת AI</h3>
          <p className="text-[10px] text-ink-subtle">
            {connected ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
                מחובר · תשובות רק ממקורות השיעור
              </>
            ) : (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1" />
                מתחבר…
              </>
            )}
          </p>
        </div>
        {lesson.files && lesson.files.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-violet-500/10 text-violet-300"
            title={`${lesson.files.length} מקורות`}
          >
            <Paperclip size={10} />
            {lesson.files.length}
          </span>
        )}
      </div>

      {/* No-sources nudge */}
      {!hasSources && (
        <div className="px-4 py-3 border-b border-amber-500/10 bg-amber-500/5 flex items-start gap-2 text-[11px] text-amber-200/90">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>
            עדיין אין מקורות בשיעור הזה. כתוב קצת סיכום משמאל או הוסף קבצים, ואז ה-AI יוכל לענות מעליהם.
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-gradient-to-br from-indigo-500/20 to-violet-500/15 text-ink border border-indigo-400/20'
                  : 'bg-white/5 text-ink border border-white/5'
              }`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {m.content}
            </div>
          </motion.div>
        ))}
        {typing && (
          <div className="flex justify-end">
            <div className="bg-white/5 border border-white/5 rounded-2xl px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" />
                <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-white/5 flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={hasSources ? 'שאל על השיעור…' : 'צריך קודם סיכום או קובץ בשיעור'}
          rows={1}
          disabled={!connected || !hasSources}
          className="input-dark flex-1 text-xs resize-none max-h-24 disabled:opacity-50"
          dir="rtl"
        />
        <button
          onClick={send}
          disabled={!input.trim() || !connected || !hasSources}
          className="btn-gradient p-2.5 rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          title="שלח (Enter)"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}
