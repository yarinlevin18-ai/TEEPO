'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, Trash2, Plus, Download, Copy, Check, RefreshCw, MessageSquare, PanelRightOpen, X } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import type { ChatMessage } from '@/types'
import { useAuth } from '@/lib/auth-context'
import GlowCard from '@/components/ui/GlowCard'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
const STORAGE_KEY = 'smartdesk_conversations'
// Render free-tier sleeps after ~15min idle. A cold start is 30-60s, so
// retry aggressively over ~2 minutes before giving up.
const MAX_RETRIES = 6
const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000, 45000]
// Socket.io default connect timeout is ~20s; bump to 60s to cover a cold boot.
const SOCKET_TIMEOUT = 60_000

type AgentType = 'study_buddy'

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

const AGENT_CONFIG: Record<AgentType, { label: string; icon: React.ElementType; placeholder: string; color: string }> = {
  study_buddy: {
    label: 'SmartDesk AI',
    icon: Bot,
    placeholder: 'שאל אותי כל שאלה...',
    color: 'primary',
  },
}

const SUGGESTION_CHIPS = [
  'מה זה רקורסיה? תסביר בקצרה',
  'תעזור לי להבין Big O notation',
  'איך ניגשים לפתרון בעיות DP',
  'טיפים ללמידה לפני מבחן',
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const dayMs = 86400000
    if (diff < dayMs) return 'היום'
    if (diff < dayMs * 2) return 'אתמול'
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveConversations(convos: Conversation[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos))
  } catch {
    // storage full — silently fail
  }
}

export default function StudyBuddyPage() {
  const { user } = useAuth()
  const [activeAgent] = useState<AgentType>('study_buddy')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [connected, setConnected] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Conversation list state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null)

  // Reconnect state
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load conversations from localStorage on mount
  useEffect(() => {
    const loaded = loadConversations()
    setConversations(loaded)
    if (loaded.length > 0) {
      const latest = loaded[0]
      setActiveConvoId(latest.id)
      setMessages(latest.messages)
    }
  }, [])

  // Persist messages to active conversation whenever they change
  useEffect(() => {
    if (!activeConvoId || messages.length === 0) return
    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === activeConvoId
          ? {
              ...c,
              messages,
              title: c.title || messages.find(m => m.role === 'user')?.content.slice(0, 40) || 'שיחה חדשה',
              updatedAt: new Date().toISOString(),
            }
          : c
      )
      saveConversations(updated)
      return updated
    })
  }, [messages, activeConvoId])

  // Connect socket with retry logic. Wakes the Render container via a
  // cheap HTTP ping first so the actual socket handshake doesn't race
  // against the cold-start window.
  const connectSocket = useCallback(() => {
    if (socketRef.current?.connected) return

    socketRef.current?.disconnect()

    // Fire-and-forget wake-up ping — Render routes this through the same
    // container that will serve the socket, so by the time io() handshakes
    // Python's running. Timeout so it doesn't block forever on failure.
    try {
      fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(60_000) }).catch(() => {})
    } catch { /* AbortSignal.timeout unsupported in very old browsers — ignore */ }

    const socket = io(BACKEND, {
      transports: ['polling', 'websocket'], // start with polling (more reliable for handshake), then upgrade
      timeout: SOCKET_TIMEOUT,
      reconnection: false, // we handle reconnection ourselves
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setRetryCount(0)
      setIsRetrying(false)
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      socket.emit('join', { user_id: user?.id || 'anonymous', agent_type: activeAgent })
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('connect_error', () => {
      setConnected(false)
    })

    socket.on('connected', () => {
      // Only set welcome message if this is a fresh conversation with no messages
      setMessages(prev => {
        if (prev.length === 0) {
          return [{
            role: 'assistant',
            content: 'היי, מה נלמד היום? אפשר לשאול אותי כל שאלה, לבקש הסבר על נושא, או עזרה בתרגיל.',
            timestamp: new Date().toISOString(),
          }]
        }
        return prev
      })
    })

    socket.on('history_loaded', ({ messages: hist }) => {
      if (hist && hist.length > 0) setMessages(hist)
    })

    socket.on('typing', () => setIsTyping(true))
    socket.on('searching', () => setIsSearching(true))

    socket.on('reply', ({ text }: { text: string }) => {
      setIsTyping(false)
      setIsSearching(false)
      const content = typeof text === 'string' ? text : JSON.stringify(text)
      setMessages(prev => [...prev, { role: 'assistant', content, timestamp: new Date().toISOString() }])
    })

    socket.on('error', ({ message }: { message: string }) => {
      setIsTyping(false)
      setIsSearching(false)
      const msg = typeof message === 'string' ? message : 'שגיאה לא צפויה'
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}`, timestamp: new Date().toISOString() }])
    })

    return socket
  }, [activeAgent, user?.id])

  // Initial connect
  useEffect(() => {
    const socket = connectSocket()
    return () => { socket?.disconnect() }
  }, [connectSocket])

  // Auto-retry on disconnect / connect_error with exponential backoff.
  // Unlike before we DO retry from the first failed attempt — needed because
  // Render's cold-start routinely burns the initial 20s handshake timeout.
  useEffect(() => {
    if (connected || isRetrying) return
    if (retryCount >= MAX_RETRIES) return
    // Don't start retrying until the initial connectSocket() has actually run
    // (socketRef.current is set as soon as it does).
    if (!socketRef.current) return

    setIsRetrying(true)
    const delay = RETRY_DELAYS[retryCount] ?? 30_000
    retryTimerRef.current = setTimeout(() => {
      setRetryCount(prev => prev + 1)
      connectSocket()
      setIsRetrying(false)
    }, delay)

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [connected, retryCount, isRetrying, connectSocket])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const manualReconnect = () => {
    setRetryCount(0)
    setIsRetrying(false)
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    connectSocket()
  }

  const sendMessage = (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || !socketRef.current) return

    // Ensure we have an active conversation
    if (!activeConvoId) {
      const newConvo: Conversation = {
        id: generateId(),
        title: '',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setConversations(prev => {
        const updated = [newConvo, ...prev]
        saveConversations(updated)
        return updated
      })
      setActiveConvoId(newConvo.id)
    }

    const newMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, newMsg])
    socketRef.current.emit('message', { text: msg, agent_type: activeAgent })
    if (!text) setInput('')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    if (activeConvoId) {
      setConversations(prev => {
        const updated = prev.map(c =>
          c.id === activeConvoId ? { ...c, messages: [], updatedAt: new Date().toISOString() } : c
        )
        saveConversations(updated)
        return updated
      })
    }
  }

  // -- Conversation management --
  const createNewConversation = () => {
    const newConvo: Conversation = {
      id: generateId(),
      title: '',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setConversations(prev => {
      const updated = [newConvo, ...prev]
      saveConversations(updated)
      return updated
    })
    setActiveConvoId(newConvo.id)
    setMessages([])
    setSidebarOpen(false)
  }

  const switchConversation = (id: string) => {
    const convo = conversations.find(c => c.id === id)
    if (!convo) return
    setActiveConvoId(id)
    setMessages(convo.messages)
    setSidebarOpen(false)
  }

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id)
      saveConversations(updated)
      // If deleting the active conversation, switch to the first remaining or clear
      if (id === activeConvoId) {
        if (updated.length > 0) {
          setActiveConvoId(updated[0].id)
          setMessages(updated[0].messages)
        } else {
          setActiveConvoId(null)
          setMessages([])
        }
      }
      return updated
    })
  }

  // -- Export chat --
  const exportChat = () => {
    if (messages.length === 0) return
    const lines = messages.map(m => {
      const prefix = m.role === 'user' ? 'אני' : 'עוזר'
      const time = m.timestamp ? ` [${formatTime(m.timestamp)}]` : ''
      return `${prefix}:${time} ${m.content}`
    })
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `study-chat-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // -- Copy message --
  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {
      // fallback
    }
  }

  const config = AGENT_CONFIG[activeAgent]
  const hasUserMessages = messages.some(m => m.role === 'user')

  return (
    <div className="flex h-screen" dir="rtl">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Conversation List Panel (right side in RTL) */}
      <AnimatePresence>
        {(sidebarOpen || true) && (
          <motion.div
            initial={false}
            className={`
              fixed lg:relative z-50 lg:z-auto
              top-0 right-0 h-full
              w-72 flex-shrink-0
              transform transition-transform duration-200 ease-out
              ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
              lg:block
            `}
          >
            <GlowCard
              className="h-full rounded-none lg:rounded-l-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <div className="flex flex-col h-full">
                {/* Panel header */}
                <div className="p-3 border-b border-white/5 flex items-center gap-2">
                  <button
                    onClick={createNewConversation}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
                  >
                    <Plus size={16} />
                    שיחה חדשה
                  </button>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 text-ink-muted hover:text-white rounded-lg lg:hidden"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {conversations.length === 0 && (
                    <p className="text-xs text-ink-muted text-center mt-6 px-3">
                      אין שיחות עדיין. התחל שיחה חדשה!
                    </p>
                  )}
                  {conversations.map(convo => {
                    const isActive = convo.id === activeConvoId
                    const preview = convo.title
                      || convo.messages.find(m => m.role === 'user')?.content.slice(0, 40)
                      || 'שיחה חדשה'
                    return (
                      <button
                        key={convo.id}
                        onClick={() => switchConversation(convo.id)}
                        className={`
                          group w-full text-right px-3 py-2.5 rounded-xl text-sm transition-colors relative
                          ${isActive
                            ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/20'
                            : 'text-ink-muted hover:bg-white/5 border border-transparent'
                          }
                        `}
                      >
                        <div className="flex items-start gap-2">
                          <MessageSquare size={14} className="mt-0.5 flex-shrink-0 opacity-50" />
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-xs leading-relaxed">{preview}</p>
                            <p className="text-[10px] text-ink-muted mt-0.5 opacity-60">
                              {formatDate(convo.updatedAt)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => deleteConversation(convo.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all flex-shrink-0"
                            title="מחק שיחה"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </GlowCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="border-b border-white/5 bg-[#0f1117]/80 backdrop-blur-sm px-4 sm:px-6 py-4 flex items-center gap-3">
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-ink-muted hover:text-white rounded-lg lg:hidden"
          >
            <PanelRightOpen size={18} />
          </button>

          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
            <Bot size={16} />
            SmartDesk AI
          </div>

          <div className="mr-auto flex items-center gap-2 sm:gap-3">
            {/* Connection status / reconnect */}
            {connected ? (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                מחובר
              </span>
            ) : retryCount >= MAX_RETRIES ? (
              <button
                onClick={manualReconnect}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                title="לא הצלחנו להתחבר לשרת. נסה שוב."
              >
                <RefreshCw size={12} />
                התחבר מחדש
              </button>
            ) : isRetrying || retryCount > 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-amber-400" title="Render ישן — הקפצת השרת לוקחת כדקה">
                <RefreshCw size={12} className="animate-spin" />
                מעיר את השרת... (עד דקה)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
                מתחבר...
              </span>
            )}

            {/* Export button */}
            <button
              onClick={exportChat}
              disabled={messages.length === 0}
              className="p-2 text-ink-muted hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="ייצא שיחה"
            >
              <Download size={16} />
            </button>

            {/* Clear chat */}
            <button
              onClick={clearChat}
              className="p-2 text-ink-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="נקה שיחה"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-500'
                    : 'bg-white/5 border border-white/8'
                }`}>
                  {msg.role === 'user'
                    ? <User size={16} className="text-white" />
                    : <config.icon size={16} className="text-ink-muted" />
                  }
                </div>

                {/* Bubble + actions */}
                <div className={`max-w-[75%] relative ${msg.role === 'user' ? 'text-left' : 'text-right'}`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'text-white rounded-tl-sm'
                        : 'glass-sm text-ink rounded-tr-sm'
                    }`}
                    style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } : undefined}
                  >
                    {msg.content}
                  </div>

                  {/* Timestamp on hover */}
                  {msg.timestamp && (
                    <span className="absolute -bottom-5 text-[10px] text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                      style={msg.role === 'user' ? { left: 0 } : { right: 0 }}
                    >
                      {formatTime(msg.timestamp)}
                    </span>
                  )}

                  {/* Copy button for AI messages */}
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => copyMessage(msg.content, i)}
                      className="absolute -bottom-5 left-0 text-ink-subtle hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all p-0.5"
                      title="העתק"
                    >
                      {copiedIndex === i
                        ? <Check size={12} className="text-green-400" />
                        : <Copy size={12} />
                      }
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Empty state with suggestion chips */}
          {!hasUserMessages && messages.length <= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-center gap-4 mt-8"
            >
              <p className="text-sm text-ink-muted">לא בטוח מאיפה להתחיל? נסה אחד מאלה:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    className="glass-sm px-4 py-2 rounded-xl text-sm text-ink-muted hover:bg-white/[0.08] hover:text-indigo-300 transition-colors border border-white/5"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Typing / Searching indicator */}
          {(isTyping || isSearching) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/8 flex items-center justify-center">
                <config.icon size={16} className="text-ink-muted" />
              </div>
              <div className="glass-sm rounded-2xl rounded-tr-sm px-4 py-3 flex gap-1.5 items-center">
                {isSearching ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-indigo-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs text-indigo-400">מחפש באינטרנט...</span>
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

        {/* Input */}
        <div className="border-t border-white/5 bg-[#0f1117]/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="flex gap-3 max-w-4xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={config.placeholder}
              rows={1}
              className="input-dark flex-1 resize-none max-h-32"
              style={{ direction: 'rtl' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || !connected}
              className="btn-gradient px-4 py-3 rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90 flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-center text-xs text-ink-muted mt-2">Enter לשליחה · Shift+Enter לשורה חדשה</p>
        </div>
      </div>
    </div>
  )
}
