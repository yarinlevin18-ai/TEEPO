'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, Trash2, GraduationCap } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import type { ChatMessage } from '@/types'
import { useAuth } from '@/lib/auth-context'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

type AgentType = 'study_buddy' | 'academic'

const AGENT_CONFIG: Record<AgentType, { label: string; icon: React.ElementType; placeholder: string; color: string }> = {
  study_buddy: {
    label: 'עוזר הלימוד',
    icon: Bot,
    placeholder: 'שאל אותי כל שאלה בלימודים...',
    color: 'primary',
  },
  academic: {
    label: 'יועץ BGU',
    icon: GraduationCap,
    placeholder: 'שאל על קורסים, דרישות, ואסטרטגיה ב-BGU...',
    color: 'amber',
  },
}

export default function StudyBuddyPage() {
  const { user } = useAuth()
  const [activeAgent, setActiveAgent] = useState<AgentType>('study_buddy')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Connect socket
  useEffect(() => {
    const socket = io(BACKEND, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join', { user_id: user?.id || 'anonymous', agent_type: activeAgent })
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('connected', () => {
      setMessages([{
        role: 'assistant',
        content: activeAgent === 'study_buddy'
          ? 'שלום! אני עוזר הלימוד שלך. שאל אותי כל שאלה בלימודים ואשמח לעזור! 😊'
          : 'שלום! אני היועץ האקדמי שלך ל-BGU. שאל אותי על קורסים, דרישות, ואסטרטגיית לימוד!',
      }])
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
    })

    socket.on('error', ({ message }: { message: string }) => {
      setIsTyping(false)
      setIsSearching(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${message}` }])
    })

    return () => { socket.disconnect() }
  }, [activeAgent])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMessage = () => {
    const text = input.trim()
    if (!text || !socketRef.current) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    socketRef.current.emit('message', { text, agent_type: activeAgent })
    setInput('')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => setMessages([])

  const switchAgent = (agent: AgentType) => {
    setActiveAgent(agent)
    setMessages([])
    socketRef.current?.emit('join', { user_id: 'dev-user', agent_type: agent })
  }

  const config = AGENT_CONFIG[activeAgent]

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-white/5 bg-[#0f1117]/80 backdrop-blur-sm px-6 py-4 flex items-center gap-4">
        {/* Agent switcher */}
        <div className="flex gap-2">
          {(Object.entries(AGENT_CONFIG) as [AgentType, typeof AGENT_CONFIG[AgentType]][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => switchAgent(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeAgent === key
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                  : 'text-ink-muted hover:text-ink hover:bg-white/5'
              }`}
            >
              <cfg.icon size={16} />
              {cfg.label}
            </button>
          ))}
        </div>

        <div className="mr-auto flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-ink-muted'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-white/20'}`} />
            {connected ? 'מחובר' : 'מתחבר...'}
          </span>
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
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
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

              {/* Bubble */}
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'text-white rounded-tl-sm'
                  : 'glass-sm text-ink rounded-tr-sm'
              }`}
              style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } : undefined}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

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
      <div className="border-t border-white/5 bg-[#0f1117]/80 backdrop-blur-sm p-4">
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
            onClick={sendMessage}
            disabled={!input.trim() || !connected}
            className="btn-gradient px-4 py-3 rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90 flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-xs text-ink-muted mt-2">Enter לשליחה · Shift+Enter לשורה חדשה</p>
      </div>
    </div>
  )
}
