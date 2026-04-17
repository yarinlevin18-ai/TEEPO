'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle, X, Send, Bot, User, Sparkles,
  Minimize2, Maximize2, Trash2, BookOpen,
} from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { usePathname } from 'next/navigation'
import type { ChatMessage } from '@/types'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

// Render free-tier sleeps after 15 min idle and takes 30-60s to cold-start.
// We retry aggressively and show a helpful UI hint instead of silently failing.
const MAX_RETRIES = 6
const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000, 45000]
const SOCKET_TIMEOUT = 60_000

/**
 * Floating AI Chat Widget — available on every page.
 * Context-aware: detects current course from URL and passes it to the AI.
 */
export default function AIChatWidget() {
  const { user } = useAuth()
  const { db, ready } = useDB()
  const pathname = usePathname()

  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [connected, setConnected] = useState(false)
  const [unread, setUnread] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Extract course ID from URL if on a course page
  const courseId = pathname?.match(/\/courses\/([^/]+)/)?.[1] || ''
  const isOnCoursePage = !!courseId
  const isOnStudyBuddyPage = pathname === '/study-buddy'

  // Connect socket — with cold-start resilience (Render free-tier naps after 15 min)
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const connect = async () => {
      // Wake the server up first — Render's free tier needs a ping to start the container,
      // and a plain HTTP request gets through faster than a websocket upgrade.
      try {
        fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(60_000) }).catch(() => {})
      } catch { /* AbortSignal.timeout may not exist on old browsers — safe to ignore */ }

      if (cancelled) return

      const socket = io(BACKEND, {
        transports: ['polling', 'websocket'], // polling first — survives cold-start better
        timeout: SOCKET_TIMEOUT,
        reconnection: false, // we handle retries ourselves with visible UI feedback
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
        // Kick off the next retry if we have budget left
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

      socket.on('connected', () => {
        if (messages.length === 0) {
          const greeting = isOnCoursePage
            ? 'היי, אני רואה שאתה בדף קורס. אני מכיר את החומר שלך, אז תשאל כל שאלה.'
            : 'היי, מה נלמד? אפשר לשאול שאלות, לבקש הסבר על נושא, או עזרה בתרגיל.'
          setMessages([{ role: 'assistant', content: greeting }])
        }
      })

      socket.on('history_loaded', ({ messages: hist }) => {
        if (hist && hist.length > 0) setMessages(hist)
      })

      socket.on('typing', () => setIsTyping(true))
      socket.on('searching', () => setIsSearching(true))

      socket.on('reply', ({ text }: { text: string }) => {
        setIsTyping(false)
        setIsSearching(false)
        setMessages((prev) => [...prev, { role: 'assistant', content: text }])
        if (!isOpen) setUnread((u) => u + 1)
      })

      socket.on('error', ({ message }: { message: string }) => {
        setIsTyping(false)
        setIsSearching(false)
        setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${message}` }])
      })
    }

    connect()

    return () => {
      cancelled = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [isOpen])

  // Manual reconnect — used after the retry budget is exhausted
  const reconnect = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    socketRef.current?.disconnect()
    setRetryCount(0)
    setIsRetrying(false)
    // Toggle isOpen off→on to re-run the connect effect
    setIsOpen(false)
    setTimeout(() => setIsOpen(true), 50)
  }

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
      setUnread(0)
    }
  }, [isOpen])

  // Don't render on the full study-buddy page (it has its own chat)
  if (isOnStudyBuddyPage) return null

  /**
   * Build a compact context string from the Drive DB so the backend bot
   * actually knows what the user is studying. The backend accepts up to
   * 10,000 chars in the `context` field; we stay well below that.
   *
   * On a course page → focus on that course (title, lessons, notes).
   * Otherwise → list all courses + pending tasks/assignments briefly.
   */
  const buildContext = (): string => {
    if (!ready) return ''
    const parts: string[] = []

    if (courseId) {
      const course = db.courses.find((c) => c.id === courseId)
      if (course) {
        parts.push(`קורס נוכחי: ${course.title}`)
        if (course.description) parts.push(`תיאור: ${course.description.slice(0, 400)}`)

        const lessons = db.lessons
          .filter((l) => l.course_id === courseId)
          .sort((a, b) => a.order_index - b.order_index)
          .slice(0, 20)
        if (lessons.length) {
          parts.push('שיעורים:')
          for (const l of lessons) {
            const summary = l.ai_summary ? `: ${l.ai_summary.slice(0, 200)}` : ''
            parts.push(`- ${l.title}${summary}`)
          }
        }

        const notes = db.notes
          .filter((n) => n.course_id === courseId)
          .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
          .slice(0, 5)
        if (notes.length) {
          parts.push('\nהערות אישיות:')
          for (const n of notes) {
            parts.push(`**${n.title}**\n${(n.content || '').slice(0, 400)}`)
          }
        }
      }
    } else {
      if (db.courses.length) {
        parts.push(`קורסים פעילים (${db.courses.length}):`)
        for (const c of db.courses.slice(0, 20)) {
          parts.push(`- ${c.title}`)
        }
      }
      const openTasks = db.tasks.filter((t) => !t.is_completed).slice(0, 10)
      if (openTasks.length) {
        parts.push(`\nמשימות פתוחות (${openTasks.length}):`)
        for (const t of openTasks) {
          const due = t.scheduled_date ? ` (${t.scheduled_date})` : ''
          parts.push(`- ${t.title}${due}`)
        }
      }
      const openAssignments = db.assignments
        .filter((a) => a.status !== 'submitted')
        .slice(0, 10)
      if (openAssignments.length) {
        parts.push(`\nמטלות פתוחות (${openAssignments.length}):`)
        for (const a of openAssignments) {
          const due = a.deadline ? ` (עד ${a.deadline})` : ''
          parts.push(`- ${a.title}${due}`)
        }
      }
    }

    return parts.join('\n').slice(0, 9000)
  }

  const sendMessage = () => {
    const text = input.trim()
    if (!text || !socketRef.current) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    socketRef.current.emit('message', {
      text,
      agent_type: 'study_buddy',
      course_id: courseId,
      context: buildContext(),
    })
    setInput('')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/30"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            }}
          >
            <Sparkles size={24} className="text-white" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {unread}
              </span>
            )}
            {/* Pulse ring — pure CSS to avoid Framer Motion parent-child conflicts */}
            <span className="absolute inset-0 rounded-full border-2 border-indigo-400 animate-[chat-ping_2s_ease-out_infinite]" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`fixed z-50 flex flex-col ${
              isExpanded
                ? 'bottom-4 left-4 right-4 top-4 md:bottom-6 md:left-6 md:right-auto md:top-auto md:w-[600px] md:h-[85vh]'
                : 'bottom-6 left-6 w-[380px] h-[520px]'
            }`}
            style={{
              background: 'rgba(15,17,23,0.97)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.1)',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                <Bot size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-ink">SmartDesk AI</h3>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    connected
                      ? 'bg-green-400'
                      : isRetrying
                      ? 'bg-amber-400 animate-pulse'
                      : retryCount >= MAX_RETRIES
                      ? 'bg-red-400'
                      : 'bg-white/20'
                  }`} />
                  <span className="text-[10px] text-ink-muted">
                    {connected
                      ? (isOnCoursePage ? 'מחובר · בהקשר קורס' : 'מחובר')
                      : retryCount >= MAX_RETRIES
                      ? 'השרת לא זמין'
                      : isRetrying
                      ? `מעיר את השרת... (${retryCount}/${MAX_RETRIES})`
                      : 'מתחבר...'}
                  </span>
                  {!connected && retryCount >= MAX_RETRIES && (
                    <button
                      onClick={reconnect}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                    >
                      נסה שוב
                    </button>
                  )}
                  {isOnCoursePage && connected && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center gap-1">
                      <BookOpen size={8} /> קורס
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMessages([])}
                  className="p-1.5 rounded-lg text-ink-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="נקה שיחה"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-all"
                  title={isExpanded ? 'מזער' : 'הגדל'}
                >
                  {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ direction: 'rtl' }}>
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    style={{ direction: 'rtl' }}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-indigo-500 to-violet-500'
                        : 'bg-white/5 border border-white/8'
                    }`}>
                      {msg.role === 'user'
                        ? <User size={12} className="text-white" />
                        : <Bot size={12} className="text-indigo-400" />
                      }
                    </div>

                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'text-white rounded-tl-sm'
                        : 'text-ink rounded-tr-sm'
                    }`}
                    style={
                      msg.role === 'user'
                        ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
                    }
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {(isTyping || isSearching) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/5 border border-white/8 flex items-center justify-center">
                    <Bot size={12} className="text-indigo-400" />
                  </div>
                  <div className="px-3 py-2 rounded-2xl rounded-tr-sm flex gap-1.5 items-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {isSearching ? (
                      <>
                        <svg className="animate-spin h-3 w-3 text-indigo-400" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-[11px] text-indigo-400">מחפש באינטרנט...</span>
                      </>
                    ) : (
                      <>
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Quick actions for course pages */}
            {isOnCoursePage && messages.length <= 1 && (
              <div className="px-4 pb-2 flex gap-1.5 flex-wrap" style={{ direction: 'rtl' }}>
                {['סכם את הקורס', 'מה חשוב לבחינה?', 'הסבר מושג מפתח'].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q)
                      setTimeout(() => {
                        setMessages((prev) => [...prev, { role: 'user', content: q }])
                        socketRef.current?.emit('message', {
                          text: q,
                          agent_type: 'study_buddy',
                          course_id: courseId,
                          context: buildContext(),
                        })
                      }, 100)
                    }}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-white/5">
              <div className="flex gap-2" style={{ direction: 'rtl' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={isOnCoursePage ? 'שאל על הקורס...' : 'שאל אותי כל שאלה...'}
                  rows={1}
                  className="flex-1 resize-none max-h-24 text-sm rounded-xl px-3 py-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f1f5f9',
                    outline: 'none',
                    direction: 'rtl',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || !connected}
                  className="px-3 py-2.5 rounded-xl text-white disabled:opacity-30 transition-opacity flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
