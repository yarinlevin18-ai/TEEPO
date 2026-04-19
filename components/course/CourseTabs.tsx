'use client'

/**
 * Course workspace — a click-minimized dashboard for a single course.
 *
 * UX principles:
 *  1. The Notes editor is the centerpiece — always open, auto-saved,
 *     cursor-ready the moment the page loads.
 *  2. Every side panel has an inline "type + Enter = added" input. No
 *     modals, no toggle flows, no "+ click → form → submit".
 *  3. Empty states are small inline hints, not huge empty cards.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckSquare, FileText, StickyNote, MessageCircle, Trash2,
  Loader2, Calendar, Send, Sparkles, X, Plus,
  Check, FileDown, BookOpen,
} from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { useDB } from '@/lib/db-context'
import { useAuth } from '@/lib/auth-context'
import { exportNoteToWord } from '@/lib/export-to-word'
import QuickAddInput from './QuickAddInput'
import type { Assignment, StudyTask, CourseNote, ChatMessage } from '@/types'
import { format } from 'date-fns'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

// Kept for backward compatibility with callers that still import the tabs.
export type CourseTab = 'tasks' | 'assignments' | 'notes' | 'ai'
export const COURSE_TAB_META: { id: CourseTab; label: string; icon: any }[] = [
  { id: 'tasks',       label: 'משימות',   icon: CheckSquare  },
  { id: 'assignments', label: 'מטלות',    icon: FileText     },
  { id: 'notes',       label: 'סיכומים',  icon: StickyNote   },
  { id: 'ai',          label: 'עוזר AI',  icon: MessageCircle },
]

// ═══════════════════════════════════════════════════════════════
// MAIN WORKSPACE
// ═══════════════════════════════════════════════════════════════

/**
 * Dashboard layout for a course. Notes editor is the hero on the left,
 * compact inline-add panels stack on the right.
 *
 * `lessonsSlot` is an optional render-slot for the existing lessons UI
 * from the course page — we leave that to the parent so we don't
 * re-implement file uploads and AI summarization here.
 */
export function CourseWorkspace({
  courseId,
  courseTitle,
  lessonsSlot,
}: {
  courseId: string
  courseTitle: string
  lessonsSlot?: React.ReactNode
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      {/* LEFT — Notes editor (hero) */}
      <section className="min-w-0 space-y-5">
        <NotesHero courseId={courseId} courseTitle={courseTitle} />
        {lessonsSlot}
      </section>

      {/* RIGHT — compact inline-add panels */}
      <aside className="space-y-4 min-w-0">
        <TasksMini courseId={courseId} />
        <AssignmentsMini courseId={courseId} />
        <AIMini courseId={courseId} courseTitle={courseTitle} />
      </aside>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// NOTES HERO — always-open rich editor, pills to switch between notes
// ═══════════════════════════════════════════════════════════════

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function NotesHero({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const { db, createNote, updateNote, deleteNote } = useDB()

  // Notes for this course, most-recent first
  const notes = useMemo(
    () =>
      db.notes
        .filter(n => n.course_id === courseId)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [db.notes, courseId],
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialisedRef = useRef(false)

  // Default to the most recent note when the list first arrives
  useEffect(() => {
    if (initialisedRef.current) return
    if (notes.length > 0) {
      setActiveId(notes[0].id)
      setTitle(notes[0].title)
      setContent(notes[0].content)
      initialisedRef.current = true
    }
  }, [notes])

  // Load the selected note into the editor when the user switches pills
  useEffect(() => {
    if (!activeId) return
    const n = notes.find(x => x.id === activeId)
    if (n && (n.title !== title || n.content !== content)) {
      setTitle(n.title)
      setContent(n.content)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const active = activeId ? notes.find(n => n.id === activeId) : null

  // Debounced auto-save — only runs when we have a note AND the content changed
  useEffect(() => {
    if (!active) return
    const unchanged = title === active.title && content === active.content
    if (unchanged) return
    if (!title.trim() && !content.trim()) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveState('saving')
    debounceRef.current = setTimeout(async () => {
      try {
        await updateNote(active.id, { title: title.trim() || 'ללא כותרת', content })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1800)
      } catch {
        setSaveState('error')
      }
    }, 1200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, active?.id])

  const handleNewNote = useCallback(async () => {
    try {
      const created = await createNote(courseId, {
        title: `סיכום ${format(new Date(), 'dd/MM')}`,
        content: '',
      })
      setActiveId(created.id)
      setTitle(created.title)
      setContent('')
      initialisedRef.current = true
    } catch {
      /* swallow */
    }
  }, [courseId, createNote])

  const handleDelete = async () => {
    if (!active) return
    if (!confirm(`למחוק את הסיכום "${active.title}"?`)) return
    await deleteNote(active.id)
    setActiveId(null)
    setTitle('')
    setContent('')
    initialisedRef.current = false
  }

  const handleExport = () => {
    if (!active) return
    exportNoteToWord({
      title: `${courseTitle} — ${title || active.title}`,
      html: content || active.content,
      rtl: true,
    })
  }

  // If there are no notes yet, show an editor that creates one on first keystroke
  const showEmptyStarter = notes.length === 0 && !active

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Pills bar + quick actions */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 overflow-x-auto">
        <StickyNote size={14} className="text-indigo-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-ink-muted flex-shrink-0 ml-1">סיכומים</span>

        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none">
          {notes.map(n => {
            const isActive = n.id === activeId
            return (
              <button
                key={n.id}
                onClick={() => setActiveId(n.id)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/30 to-violet-500/30 text-ink border border-indigo-400/30'
                    : 'bg-white/5 text-ink-muted hover:text-ink hover:bg-white/10 border border-transparent'
                }`}
              >
                {n.title || 'ללא כותרת'}
              </button>
            )
          })}
          <button
            onClick={handleNewNote}
            className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-300 text-ink-muted flex items-center justify-center transition-all"
            title="סיכום חדש"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Save indicator */}
        <SaveIndicator state={saveState} />

        {/* Export to Word */}
        {active && content && (
          <button
            onClick={handleExport}
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
            title="הורד כ-Word"
          >
            <FileDown size={12} />
            Word
          </button>
        )}

        {/* Delete current */}
        {active && (
          <button
            onClick={handleDelete}
            className="flex-shrink-0 p-1.5 rounded-lg text-ink-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="מחק סיכום"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Title input */}
      {(active || showEmptyStarter) && (
        <div className="px-4 pt-4 pb-2">
          <input
            type="text"
            value={title}
            onChange={e => {
              const v = e.target.value
              setTitle(v)
              // If this is a "ghost" session (no note yet), create on first keystroke
              if (!active && (v || content) && !showEmptyStarter) return
            }}
            onFocus={async () => {
              // Auto-create a note the moment the user engages with the empty editor
              if (!active && showEmptyStarter) {
                await handleNewNote()
              }
            }}
            placeholder="כותרת הסיכום…"
            className="w-full bg-transparent border-0 outline-none text-lg font-bold text-ink placeholder:text-ink-subtle"
          />
        </div>
      )}

      {/* Rich editor (always visible) */}
      <div className="px-2 pb-3">
        <div className="editor-shell">
          <RichTextEditor
            content={content}
            onChange={async html => {
              setContent(html)
              // If the user just starts typing into the blank starter editor,
              // create a note on the fly so their keystrokes are persisted.
              if (!active && html && html !== '<p></p>') {
                await handleNewNote()
              }
            }}
            placeholder="התחל לכתוב את הסיכום שלך כאן. Enter כדי לרדת שורה, toolbar למעלה לעיצוב…"
          />
        </div>
      </div>

      {/* Editor chrome overrides to look less boxy */}
      <style jsx>{`
        .editor-shell :global(.rich-editor-content) {
          min-height: 280px;
          padding: 12px 14px;
        }
      `}</style>
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const config = {
    saving: { icon: Loader2, label: 'שומר…', color: '#B8A9FF', bg: 'rgba(139,127,240,0.15)' },
    saved:  { icon: Check,   label: 'נשמר',  color: '#4ADE80', bg: 'rgba(74,222,128,0.15)' },
    error:  { icon: X,       label: 'שגיאה', color: '#FF6B6B', bg: 'rgba(255,107,107,0.15)' },
  } as const
  const c = config[state]
  const Icon = c.icon
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium"
      style={{ color: c.color, background: c.bg }}
    >
      <Icon size={11} className={state === 'saving' ? 'animate-spin' : ''} />
      {c.label}
    </motion.span>
  )
}

// ═══════════════════════════════════════════════════════════════
// TASKS MINI — inline quick-add, compact list
// ═══════════════════════════════════════════════════════════════

function TasksMini({ courseId }: { courseId: string }) {
  const { db, createTask, updateTask, deleteTask } = useDB()
  const tasks = db.tasks.filter(t => t.course_id === courseId)
  const pending = tasks.filter(t => !t.is_completed)
  const done = tasks.filter(t => t.is_completed)

  return (
    <div className="glass rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <CheckSquare size={14} className="text-indigo-400" />
          משימות
          {pending.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-medium">
              {pending.length}
            </span>
          )}
        </h3>
      </div>

      <QuickAddInput
        placeholder="משימה חדשה…"
        accent="indigo"
        onAdd={text =>
          createTask({
            title: text,
            course_id: courseId,
            scheduled_date: format(new Date(), 'yyyy-MM-dd'),
            category: 'study',
          })
        }
      />

      {tasks.length === 0 ? (
        <p className="text-[11px] text-ink-subtle text-center py-3">
          הוסף משימה — חזרה, תרגול, פרויקט…
        </p>
      ) : (
        <div className="space-y-1">
          {pending.map(t => (
            <TaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />
          ))}
          {done.length > 0 && (
            <details className="pt-1">
              <summary className="text-[11px] text-ink-subtle cursor-pointer hover:text-ink px-1 py-1">
                הושלמו ({done.length})
              </summary>
              <div className="space-y-1 mt-1">
                {done.map(t => <TaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }: {
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

// ═══════════════════════════════════════════════════════════════
// ASSIGNMENTS MINI
// ═══════════════════════════════════════════════════════════════

function AssignmentsMini({ courseId }: { courseId: string }) {
  const { db, createAssignment, updateAssignment, deleteAssignment } = useDB()
  const assignments = db.assignments.filter(a => a.course_id === courseId)

  return (
    <div className="glass rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <FileText size={14} className="text-amber-400" />
          מטלות
          {assignments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
              {assignments.length}
            </span>
          )}
        </h3>
      </div>

      <QuickAddInput
        placeholder='מטלה חדשה (למשל "תרגיל 3")…'
        accent="amber"
        onAdd={text =>
          createAssignment({
            title: text,
            course_id: courseId,
            priority: 'medium',
          })
        }
      />

      {assignments.length === 0 ? (
        <p className="text-[11px] text-ink-subtle text-center py-3">
          תרגילים, מבחנים, פרויקטים…
        </p>
      ) : (
        <div className="space-y-1">
          {assignments.map(a => (
            <AssignmentRow key={a.id} a={a} onUpdate={updateAssignment} onDelete={deleteAssignment} />
          ))}
        </div>
      )}
    </div>
  )
}

function AssignmentRow({ a, onUpdate, onDelete }: {
  a: Assignment
  onUpdate: (id: string, patch: Partial<Assignment>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const priorityDot: Record<string, string> = {
    high:   '#ef4444',
    medium: '#f59e0b',
    low:    '#10b981',
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group transition-colors">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: priorityDot[a.priority] }}
        title={a.priority === 'high' ? 'דחוף' : a.priority === 'medium' ? 'בינוני' : 'רגיל'}
      />
      <span className="text-sm flex-1 truncate text-ink">{a.title}</span>
      {a.deadline && (
        <span className="text-[10px] text-ink-subtle flex items-center gap-0.5 flex-shrink-0">
          <Calendar size={9} /> {a.deadline.slice(5)}
        </span>
      )}
      <select
        value={a.status}
        onChange={e => onUpdate(a.id, { status: e.target.value as Assignment['status'] })}
        className="text-[10px] bg-transparent border-0 cursor-pointer text-ink-muted hover:text-ink outline-none"
      >
        <option value="todo">לא התחיל</option>
        <option value="in_progress">בתהליך</option>
        <option value="submitted">הוגש</option>
        <option value="graded">נבדק</option>
      </select>
      <button
        onClick={() => onDelete(a.id)}
        className="p-0.5 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AI MINI — collapsible chat in the side column
// ═══════════════════════════════════════════════════════════════

function AIMini({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-semibold text-ink flex items-center gap-2">
          <Sparkles size={14} className="text-violet-400" />
          עוזר AI
        </span>
        <span className="text-[11px] text-ink-subtle">
          {open ? 'סגור' : 'שאל משהו…'}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <AIChat courseId={courseId} courseTitle={courseTitle} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AIChat({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const socket = io(BACKEND, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join', { user_id: user?.id || 'anonymous', agent_type: 'study_buddy' })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connected', () => {
      if (messages.length === 0) {
        setMessages([{ role: 'assistant', content: `היי! שאל שאלה על "${courseTitle}".` }])
      }
    })
    socket.on('history_loaded', ({ messages: hist }) => {
      if (hist && hist.length > 0) setMessages(hist)
    })
    socket.on('typing', () => setTyping(true))
    socket.on('reply', ({ text }: { text: string }) => {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: text }])
    })
    socket.on('error', ({ message }: { message: string }) => {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${message}` }])
    })

    return () => { socket.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const send = () => {
    const text = input.trim()
    if (!text || !socketRef.current) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    socketRef.current.emit('message', { text, agent_type: 'study_buddy', course_id: courseId })
    setInput('')
    setTyping(true)
  }

  return (
    <div className="flex flex-col" style={{ height: 340 }}>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-500/20 text-ink border border-indigo-500/20'
                  : 'bg-white/5 text-ink border border-white/5'
              }`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-end">
            <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2">
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
      <div className="p-2 border-t border-white/5 flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="שאלה לעוזר…"
          rows={1}
          className="input-dark flex-1 text-xs resize-none max-h-20"
        />
        <button
          onClick={send}
          disabled={!input.trim() || !connected}
          className="btn-gradient p-2 rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// BACKWARD-COMPAT: old tab-switching component (kept in case any
// other caller still imports `CourseTabs`). Routes now use the new
// `CourseWorkspace` component instead.
// ═══════════════════════════════════════════════════════════════

interface LegacyTabsProps {
  courseId: string
  activeTab: CourseTab
  courseTitle: string
}

export default function CourseTabs({ courseId, activeTab, courseTitle }: LegacyTabsProps) {
  return (
    <div>
      {activeTab === 'tasks'       && <TasksMini courseId={courseId} />}
      {activeTab === 'assignments' && <AssignmentsMini courseId={courseId} />}
      {activeTab === 'notes'       && <NotesHero courseId={courseId} courseTitle={courseTitle} />}
      {activeTab === 'ai'          && <AIMini courseId={courseId} courseTitle={courseTitle} />}
    </div>
  )
}
