'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, Trash2, GraduationCap } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import type { ChatMessage } from '@/types'

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
  const [activeAgent, setActiveAgent] = useState<AgentType>('study_buddy')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Connect socket
  useEffect(() => {
    const socket = io(BACKEND, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join', { user_id: 'dev-user', agent_type: activeAgent })
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

    socket.on('reply', ({ text }: { text: string }) => {
      setIsTyping(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: text }])
    })

    socket.on('error', ({ message }: { message: string }) => {
      setIsTyping(false)
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
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center gap-4">
        {/* Agent switcher */}
        <div className="flex gap-2">
          {(Object.entries(AGENT_CONFIG) as [AgentType, typeof AGENT_CONFIG[AgentType]][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => switchAgent(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeAgent === key
                  ? 'bg-primary-50 text-primary-700 border border-primary-200'
                  : 'text-slate-500 hover:bg-surface-100'
              }`}
            >
              <cfg.icon size={16} />
              {cfg.label}
            </button>
          ))}
        </div>

        <div className="mr-auto flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-500' : 'text-slate-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-300'}`} />
            {connected ? 'מחובר' : 'מתחבר...'}
          </span>
          <button
            onClick={clearChat}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                msg.role === 'user' ? 'bg-primary-500' : 'bg-slate-100'
              }`}>
                {msg.role === 'user'
                  ? <User size={16} className="text-white" />
                  : <config.icon size={16} className="text-slate-500" />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary-500 text-white rounded-tl-sm'
                  : 'bg-white border border-surface-200 text-slate-800 rounded-tr-sm shadow-sm'
              }`}>
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <config.icon size={16} className="text-slate-500" />
            </div>
            <div className="bg-white border border-surface-200 rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm flex gap-1 items-center">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-surface-200 p-4">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={config.placeholder}
            rows={1}
            className="flex-1 border border-surface-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition max-h-32"
            style={{ direction: 'rtl' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !connected}
            className="px-4 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">Enter לשליחה · Shift+Enter לשורה חדשה</p>
      </div>
    </div>
  )
}
